import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Home.css";
import Button from "../../components/Button/Button.jsx";
import Modal from "../../components/Modal/Modal.jsx";
import Header from "../../components/Header/Header.jsx";
import loaderGif from "../../assets/citoGif.gif";
import {
    createPipelineSession,
    createPipelineSessionPreview,
    runPipelineSession,
    getPipelineSession,
    getPipelineResults,
    fetchPipelinePreview,
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
    const [topCount, setTopCount] = useState(5);
    const [isImageUpload, setIsImageUpload] = useState(false);

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
        setIsImageUpload(false);
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

    async function validateAndSet(f) {
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

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        setFile(f);
        setError("");
        setSessionId(null);
        setStatus(null);
        setResults(null);

        const isImg = IMG_EXT.includes(ext);
        setIsImageUpload(isImg);

        if (isImg) {
            const url = URL.createObjectURL(f);
            setPreviewUrl(url);
            setLoadingPreview(false);
            return;
        }

        setLoadingPreview(true);
        try {
            const session = await createPipelineSessionPreview(f);
            const id = session.id || session.sessionId || null;
            if (id == null) {
                throw new Error("No se obtuvo el ID de la sesión de preview.");
            }
            setSessionId(id);
            setStatus(session.status || "UPLOADED");

            const blob = await fetchPipelinePreview(id);
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
        } catch (e) {
            setError(e.message || "No se pudo generar la vista previa del archivo .svs.");
            setPreviewUrl(null);
        } finally {
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
    function onDragOver(e) {
        e.preventDefault();
        setDragOver(true);
    }
    function onDragLeave() {
        setDragOver(false);
    }

    useEffect(() => {
        if (status !== "DONE" || sessionId == null) return;

        let cancelled = false;
        let objectUrl = null;
        setLoadingPreview(true);

        (async () => {
            try {
                const blob = await fetchPipelinePreview(sessionId);
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setPreviewUrl(objectUrl);
            } catch (e) {
                if (cancelled) return;
                const message = e?.message || "No se pudo cargar la vista previa generada.";
                setError(message);
                setPreviewUrl(null);
            } finally {
                if (!cancelled) setLoadingPreview(false);
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [status, sessionId]);


    const isBusy = status === "QUEUED" || status === "RUNNING" || uploading;
    const canAnalyze = useMemo(
        () => !!file && !error && !loadingPreview && !isBusy,
        [file, error, loadingPreview, isBusy]
    );
    const markers = useMemo(() => {
        if (!results?.topPatches || !Array.isArray(results.topPatches)) return [];

        return results.topPatches
            .slice(0, topCount)
            .map((p, idx) => {
                const normX = p.normX ?? p.normx ?? null;
                const normY = p.normY ?? p.normy ?? null;
                if (normX == null || normY == null) return null;

                return {
                    id: idx + 1,
                    normX,
                    normY,
                };
            })
            .filter(Boolean);
    }, [results, topCount]);

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
        await refreshSession(id);
        pollRef.current = setInterval(() => refreshSession(id), POLL_MS);
    }

    async function onAnalyze() {
        if (!canAnalyze) return;

        try {
            setUploading(true);
            setError("");
            setStatus(null);
            setResults(null);

            let id = sessionId;
            let session;

            if (id != null && !isImageUpload) {
                session = await runPipelineSession(id);
            } else {
                session = await createPipelineSession(file);
            }

            id = session.id || session.sessionId || id;
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



    function handleBack() {
        clearFile();
    }

    const processingUI = (
        <div className="home__processing">
            <div className="home__status busy" aria-live="polite">
                <img src={loaderGif} alt="" className="home__loader" />
            </div>
            <div className="home__actions">
                <Button variant="muted" tone="blue" disabled className="home__analyze">
                    Procesando…
                </Button>
            </div>
        </div>
    );

    // const resultsUI =
    //     status === "DONE" &&
    //     results && (
    //         <div className="home__resultsOnly">
    //             <h3>Resultados</h3>
    //             <div className="home__grid">
    //                 <div className="home__card">
    //                     <div className="label">Diagnóstico posible</div>
    //                     <div className="value">{results.possibleDiagnosis || "—"}</div>
    //                 </div>
    //                 <div className="home__card">
    //                     <div className="label">Parches totales</div>
    //                     <div className="value">{results.tilesTotal ?? "—"}</div>
    //                 </div>
    //                 <div className="home__card">
    //                     <div className="label">Apto</div>
    //                     <div className="value">{results.aptoTotal ?? "—"}</div>
    //                 </div>
    //                 <div className="home__card">
    //                     <div className="label">No Apto (Descartado)</div>
    //                     <div className="value">{results.noAptoTotal ?? "—"}</div>
    //                 </div>
    //                 <div className="home__card">
    //                     <div className="label">No Fondo</div>
    //                     <div className="value">{results.notBackgroundTotal ?? "—"}</div>
    //                 </div>
    //                 <div className="home__card">
    //                     <div className="label">Fondo (Descartado)</div>
    //                     <div className="value">{results.backgroundTotal ?? "—"}</div>
    //                 </div>
    //             </div>

    //             {Array.isArray(results.topPatches) && results.topPatches.length > 0 && (
    //                 <div className="home__top">
    //                     <h4>Top patches</h4>
    //                     <ul className="home__topList">
    //                         {results.topPatches.slice(0, 10).map((t, i) => (
    //                             <li key={i}>
    //                                 <code>{t.rel_path || "?"}</code> — {t.cls || "?"} (
    //                                 {(t.conf ?? 0).toFixed(3)})
    //                             </li>
    //                         ))}
    //                     </ul>
    //                 </div>
    //             )}

    //             <div className="home__actions">
    //                 <Button variant="outline" tone="blue" onClick={handleBack}>
    //                     Volver
    //                 </Button>
    //             </div>
    //         </div>
    //     );

    const hasResults = status === "DONE" && results;

    const resultsUI =
        hasResults && (
            <section className="home__results">
                <div className="home__resultsHeader">
                    <div className="home__resultsTitleWrap">
                        <h2 className="home__resultsTitle">Nueva imagen</h2>
                        <button
                            type="button"
                            className="home__resultsTitleEdit"
                            aria-label="Editar nombre de la imagen"
                        >
                            ✏️
                        </button>
                    </div>

                    <select
                        className="home__resultsSelect"
                        value={String(topCount)}
                        onChange={(e) => setTopCount(Number(e.target.value))}
                    >
                        <option value="5">5 miniparches más confiables</option>
                        <option value="10">10 miniparches más confiables</option>
                    </select>
                </div>

                <div className="home__resultsGrid">
                    {/* Imagen grande con la preview del backend */}
                    <div className="home__resultsImageFrame">
                        {previewUrl ? (
                            <div className="home__resultsImageInner">
                                <img
                                    src={previewUrl}
                                    alt="Vista previa del análisis"
                                />

                                {markers.map((m) => (
                                    <div
                                        key={m.id}
                                        className="home__marker"
                                        style={{
                                            left: `${m.normX * 100}%`,
                                            top: `${m.normY * 100}%`,
                                        }}
                                    >
                                        {m.id}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="home__resultsPlaceholder">
                                Vista previa no disponible.
                            </div>
                        )}
                    </div>

                    {/* Panel derecho con mensaje “Seleccione un miniparche” */}
                    <div className="home__resultsPatchPanel">
                        <span>Seleccione un miniparche</span>
                    </div>
                </div>

                <div className="home__resultsFooter">
                    <div className="home__resultsDiagnosis">
                        <span className="home__resultsDiagnosisLabel">
                            Diagnóstico posible:&nbsp;
                        </span>
                        <span>
                            {results.possibleDiagnosis || "—"}
                        </span>
                    </div>

                    <div className="home__resultsLinks">
                        <button type="button" className="text-link">
                            Ver estadísticas del análisis
                        </button>
                        <button type="button" className="text-link">
                            Descargar resultados del análisis
                        </button>
                        <button type="button" className="text-link">
                            Vista detallada de los miniparches
                        </button>
                    </div>
                </div>

                <div className="home__resultsActions">
                    <Button variant="muted" tone="blue" onClick={handleBack}>
                        Realizar nuevo análisis
                    </Button>
                </div>
            </section>
        );


    // Render por estados:
    return (
        <>
            <Header mode="auth" />
            <div className="home">
                {/* Solo procesamiento */}
                {isBusy && processingUI}

                {/* Solo resultados */}
                {!isBusy && resultsUI}

                {/* Pantalla normal cuando no procesa ni hay resultados */}
                {!isBusy && !results && (
                    <>
                        <p className="home__lead">Empezá tu análisis</p>
                        {error && <div className="dropzone__error">{error}</div>}

                        <div
                            className={`dropzone ${dragOver ? "is-over" : ""}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            role="region"
                            aria-label="Zona para soltar archivo"
                        >
                            <div className="dropzone__canvas">
                                {previewUrl ? (
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
                                ) : file ? (
                                    loadingPreview ? (
                                        <div className="dropzone__previewLoader">
                                            <img src={loaderGif} alt="" className="home__loader" />
                                            <span>Generando vista previa...</span>
                                        </div>
                                    ) : (
                                        <div className="dropzone__empty">
                                            <div className="dropzone__icon" aria-hidden>
                                                ⤴
                                            </div>
                                            <div className="dropzone__text">
                                                Vista previa no disponible. Arrastrá otra imagen o{" "}
                                                <button
                                                    type="button"
                                                    className="dropzone__link"
                                                    onClick={browseFile}
                                                    disabled={isBusy}
                                                >
                                                    subí un archivo
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="dropzone__empty">
                                        <div className="dropzone__icon" aria-hidden>
                                            ⤴
                                        </div>
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
                            {!file ? (
                                <div className="home__metaRow">
                                    <span>Formatos admitidos: .svs, .png, .jpg</span>
                                    <span>Tamaño máximo: 5GB</span>
                                </div>
                            ) : (
                                <div className="home__fileRow">
                                    <div className="home__filename" title={file.name}>
                                        {file.name}
                                    </div>
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
                        </div>

                        <div className="home__actions">
                            <Button
                                variant="muted"
                                tone="blue"
                                disabled={!canAnalyze}
                                onClick={onAnalyze}
                                className="home__analyze"
                            >
                                Analizar
                            </Button>
                        </div>

                        <Modal open={showWelcome} onClose={closeWelcome}>
                            <div className="home__welcome">
                                <p>
                                    Bienvenido a CitoScan, tu sitio para realizar análisis de imágenes
                                    de Papanicolau.<br />Si querés saber más sobre nosotros y cómo
                                    funciona la página, <a href="/info">hacé click aquí</a>.
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
                    </>
                )}
            </div>
        </>
    );
}
