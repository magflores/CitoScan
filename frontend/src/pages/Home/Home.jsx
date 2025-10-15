import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Home.css";
import Button from "../../components/Button/Button.jsx";
import Modal from "../../components/Modal/Modal.jsx";
import Header from "../../components/Header/Header.jsx";
import loaderGif from "../../assets/citoGif.gif";
import {
    createPipelineSession,
    getPipelineSession,
    getPipelineResults,
} from "../../features/auth/api";

const LOCALSTORAGE_KEY = "cs_hide_welcome_v1";
const ACCEPT_EXT = [".svs", ".png", ".jpg", ".jpeg"];
const IMG_EXT = [".png", ".jpg", ".jpeg"];
const MAX_SIZE = 5 * 1024 * 1024 * 1024;
const POLL_MS = 2500;

export default function Home() {
    const [hideWelcome, setHideWelcome] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);

    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [status, setStatus] = useState(null); // "QUEUED" | "RUNNING" | "DONE" | "ERROR" | null
    const [results, setResults] = useState(null);

    const inputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const pollRef = useRef(null);

    useEffect(() => {
        const persisted = localStorage.getItem(LOCALSTORAGE_KEY) === "true";
        setHideWelcome(persisted);
        setShowWelcome(!persisted);
    }, []);

    function closeWelcome() {
        if (hideWelcome) localStorage.setItem(LOCALSTORAGE_KEY, "true");
        setShowWelcome(false);
    }

    function browseFile() {
        inputRef.current?.click();
    }

    function isImageFile(f) {
        const ext = "." + f.name.split(".").pop().toLowerCase();
        return IMG_EXT.includes(ext);
    }

    function stopPolling() {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }

    function clearFile() {
        setError("");
        setFile(null);
        setLoadingPreview(false);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        if (inputRef.current) inputRef.current.value = "";
        setSessionId(null);
        setStatus(null);
        setResults(null);
        stopPolling();
    }

    function validateAndSet(f) {
        if (!f) return;
        const ext = "." + f.name.split(".").pop().toLowerCase();

        if (!ACCEPT_EXT.includes(ext)) {
            setError("Formato no admitido. Usa .svs, .png o .jpg");
            clearFile();
            return;
        }
        if (f.size > MAX_SIZE) {
            setError("El archivo supera el tamaño máximo de 5GB.");
            clearFile();
            return;
        }

        setFile(f);
        setError("");
        setSessionId(null);
        setStatus(null);
        setResults(null);

        if (isImageFile(f)) {
            const url = URL.createObjectURL(f);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(url);
            setLoadingPreview(true);
        } else {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setLoadingPreview(false);
        }
    }

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            stopPolling();
        };
    }, [previewUrl]);

    function onInputChange(e) {
        validateAndSet(e.target.files?.[0]);
    }
    function onDrop(e) {
        e.preventDefault();
        setDragOver(false);
        validateAndSet(e.dataTransfer.files?.[0]);
    }
    function onDragOver(e) { e.preventDefault(); setDragOver(true); }
    function onDragLeave() { setDragOver(false); }

    const isBusy = status === "QUEUED" || status === "RUNNING" || uploading;
    const canAnalyze = useMemo(
        () => !!file && !error && !loadingPreview && !isBusy,
        [file, error, loadingPreview, isBusy]
    );

    async function refreshSession(id) {
        try {
            const s = await getPipelineSession(id);
            setStatus(s.status || null);

            if (s.status === "DONE") {
                stopPolling();
                try {
                    const r = await getPipelineResults(id);
                    setResults(r);
                } catch (e) {
                    setError(e.message || "No se pudieron obtener los resultados.");
                }
            } else if (s.status === "ERROR") {
                stopPolling();
            }
        } catch (e) {
            setError(e.message || "No se pudo actualizar el estado.");
            stopPolling();
        }
    }

    async function startPolling(id) {
        stopPolling();
        await refreshSession(id); // primer tick inmediato
        pollRef.current = setInterval(() => refreshSession(id), POLL_MS);
    }

    async function onAnalyze() {
        if (!canAnalyze) return;

        try {
            setUploading(true);
            setError("");
            setSessionId(null);
            setStatus(null);
            setResults(null);

            const session = await createPipelineSession(file);
            const id = session.id || session.sessionId || null;
            setSessionId(id);
            setStatus(session.status || "QUEUED");
            if (id != null) {
                await startPolling(id);
            } else {
                setError("No se obtuvo el ID de la sesión.");
            }
        } catch (e) {
            setError(e.message || "Error al analizar el archivo.");
        } finally {
            setUploading(false);
        }
    }

    const hasFile = !!file;
    const hasPreview = !!previewUrl;

    const statusBanner = (() => {
        if (status === "QUEUED") {
            return <div className="home__status info">Iniciando proceso…</div>;
        }
        if (status === "RUNNING") {
            return (
                <div className="home__status busy">
                    <img src={loaderGif} alt="" className="home__loader" />
                    <span>Analizando…</span>
                </div>
            );
        }
        if (status === "DONE") {
            return <div className="home__status ok">Análisis finalizado</div>;
        }
        if (status === "ERROR") {
            return <div className="home__status error">Ocurrió un error en el análisis</div>;
        }
        return null;
    })();

    return (
        <>
            {/*@TODO: Update view to show results*/}
            <Header mode="auth" />

            <div className="home">
                <p className="home__lead">Empezá tu análisis</p>

                {statusBanner}

                <div
                    className={`dropzone ${dragOver ? "is-over" : ""}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    role="region"
                    aria-label="Zona para soltar archivo"
                >
                    <div className="dropzone__canvas">
                        {hasPreview ? (
                            <>
                                <img
                                    src={previewUrl}
                                    alt={file?.name || "Vista previa"}
                                    className="dropzone__img"
                                    onLoad={() => setLoadingPreview(false)}
                                    onError={() => {
                                        setLoadingPreview(false);
                                        setError("No se pudo cargar la vista previa.");
                                    }}
                                />
                                {loadingPreview && (
                                    <div className="dropzone__previewLoader">
                                        <img src={loaderGif} alt="" className="home__loader" />
                                        <span>Cargando vista previa...</span>
                                    </div>
                                )}
                            </>
                        ) : hasFile ? (
                            <div className="dropzone__empty">
                                <div className="dropzone__icon" aria-hidden>⤴</div>
                                <div className="dropzone__text">
                                    Vista previa no disponible. Arrastrá otra imagen o{" "}
                                    <button type="button" className="dropzone__link" onClick={browseFile} disabled={isBusy}>
                                        subí un archivo
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="dropzone__empty">
                                <div className="dropzone__icon" aria-hidden>⤴</div>
                                <div className="dropzone__text">
                                    Arrastrá una imagen o{" "}
                                    <button
                                        type="button"
                                        className="text-link"
                                        onClick={browseFile}
                                        disabled={isBusy}
                                    >
                                        subí un archivo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={ACCEPT_EXT.join(",")}
                        className="dropzone__input"
                        onChange={onInputChange}
                        disabled={isBusy}
                    />
                </div>

                <div className="home__below">
                    {!hasFile ? (
                        <div className="home__metaRow">
                            <span>Formatos admitidos: .svs, .png, .jpg</span>
                            <span>Tamaño máximo: 5GB</span>
                        </div>
                    ) : (
                        <div className="home__fileRow">
                            <div className="home__filename" title={file.name}>{file.name}</div>
                            <button
                                type="button"
                                className="home__remove"
                                onClick={clearFile}
                                title="Quitar archivo"
                                aria-label="Quitar archivo"
                                disabled={isBusy}
                            >
                                <svg viewBox="0 0 24 24" className="home__trash" aria-hidden>
                                    <path
                                        d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4Zm-3 6h2v8H7v-8Zm10 0v8h-2v-8h2ZM11 11h2v8h-2v-8Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                    )}

                    {error && <div className="dropzone__error">{error}</div>}

                    {/*TODO: No se si hace falta esto*/}
                    {/*{sessionId && !error && (*/}
                    {/*    <div className="home__success">*/}
                    {/*        Sesión creada: <strong>#{sessionId}</strong>{" "}*/}
                    {/*        <a href={`/pipeline/sessions/${sessionId}`}>ver detalles</a>*/}
                    {/*    </div>*/}
                    {/*)}*/}

                    {uploading && (
                        <div className="home__uploading">
                            <img src={loaderGif} alt="" className="home__loader" />
                            <span>Subiendo archivo y analizando…</span>
                        </div>
                    )}
                </div>

                <div className="home__actions">
                    <Button
                        variant="muted"
                        tone="blue"
                        disabled={!canAnalyze}
                        onClick={onAnalyze}
                        className="home__analyze"
                    >
                        {isBusy ? "Procesando…" : "Analizar"}
                    </Button>
                </div>

                {status === "DONE" && results && (
                    <div className="home__results">
                        <h3>Resultados</h3>
                        <div className="home__grid">
                            <div className="home__card">
                                <div className="label">Diagnóstico posible</div>
                                <div className="value">{results.possibleDiagnosis || "—"}</div>
                            </div>
                            <div className="home__card">
                                <div className="label">Parches totales</div>
                                <div className="value">{results.tilesTotal ?? "—"}</div>
                            </div>
                            <div className="home__card">
                                <div className="label">No Fondo (Descartado)</div>
                                <div className="value">{results.notBackgroundTotal ?? "—"}</div>
                            </div>
                            <div className="home__card">
                                <div className="label">Fondo</div>
                                <div className="value">{results.backgroundTotal ?? "—"}</div>
                            </div>
                            <div className="home__card">
                                <div className="label">Apto</div>
                                <div className="value">{results.aptoTotal ?? "—"}</div>
                            </div>
                            <div className="home__card">
                                <div className="label">No Apto (Descartado)</div>
                                <div className="value">{results.noAptoTotal ?? "—"}</div>
                            </div>
                        </div>

                        {Array.isArray(results.topPatches) && results.topPatches.length > 0 && (
                            <div className="home__top">
                                <h4>Top patches</h4>
                                <ul className="home__topList">
                                    {results.topPatches.slice(0, 10).map((t, i) => (
                                        <li key={i}>
                                            <code>{t.rel_path || "?"}</code> — {t.cls || "?"} ({(t.conf ?? 0).toFixed(3)})
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <Modal open={showWelcome} onClose={closeWelcome}>
                    <div className="home__welcome">
                        <p>
                            Bienvenido a CitoScan, tu sitio para realizar análisis de imágenes
                            de Papanicolau.<br />Si querés saber más sobre nosotros y cómo funciona la
                            página, <a href="/info">hacé click aquí</a>.
                        </p>
                        <label className="home__welcome-check">
                            <input
                                type="checkbox"
                                checked={hideWelcome}
                                onChange={(e) => setHideWelcome(e.target.checked)}
                            />
                            <span>No volver a mostrar este mensaje</span>
                        </label>
                        <div className="home__welcome-actions">
                            <Button variant="outline" tone="pink" onClick={closeWelcome}>
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </>
    );
}