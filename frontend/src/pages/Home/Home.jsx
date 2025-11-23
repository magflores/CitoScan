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
import MiniPatch from "../../components/MiniPatch/MiniPatch.jsx";

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
    const [status, setStatus] = useState(null);
    const [results, setResults] = useState(null);
    const [topCount, setTopCount] = useState(5);
    const [isImageUpload, setIsImageUpload] = useState(false);

    const [currentStep, setCurrentStep] = useState(0);
    const [analysisStartTime, setAnalysisStartTime] = useState(null);
    const [dots, setDots] = useState("");

    const inputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const pollRef = useRef(null);

    /* ------------------------------ Welcome ------------------------------ */
    useEffect(() => {
        const persisted = localStorage.getItem(LOCALSTORAGE_KEY) === "true";
        setHideWelcome(persisted);
        setShowWelcome(!persisted);
    }, []);

    function closeWelcome() {
        if (hideWelcome) localStorage.setItem(LOCALSTORAGE_KEY, "true");
        setShowWelcome(false);
    }

    /* ------------------------------ File Handling ------------------------------ */

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

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        setFile(f);
        setSessionId(null);
        setStatus(null);
        setResults(null);
        setError("");

        const isImg = IMG_EXT.includes(ext);
        setIsImageUpload(isImg);

        if (isImg) {
            const url = URL.createObjectURL(f);
            setPreviewUrl(url);
            return;
        }

        setLoadingPreview(true);
        try {
            const session = await createPipelineSessionPreview(f);
            const id = session.id || session.sessionId;
            if (!id) throw new Error("No se obtuvo ID de sesión de preview.");

            setSessionId(id);
            setStatus(session.status || "UPLOADED");

            const blob = await fetchPipelinePreview(id);
            setPreviewUrl(URL.createObjectURL(blob));
        } catch (err) {
            setError(err.message || "No se pudo generar la vista previa.");
        } finally {
            setLoadingPreview(false);
        }
    }

    /* ------------------------------ Dropzone ------------------------------ */

    function onInputChange(e) {
        validateAndSet(e.target.files?.[0]);
    }

    function onDrop(e) {
        e.preventDefault();
        setDragOver(false);
        validateAndSet(e.dataTransfer.files?.[0]);
    }

    /* ------------------------------ Polling ------------------------------ */

    function stopPolling() {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }

    async function refreshSession(id) {
        try {
            const s = await getPipelineSession(id);
            setStatus(s.status);

            if (s.status === "DONE") {
                stopPolling();
                setCurrentStep(4);

                const r = await getPipelineResults(id);
                setResults(r);
            }
        } catch (err) {
            stopPolling();
            setError(err.message);
        }
    }

    async function startPolling(id) {
        stopPolling();
        await refreshSession(id);
        pollRef.current = setInterval(() => refreshSession(id), POLL_MS);
    }

    async function onAnalyze() {
        if (!file || error || loadingPreview || uploading) return;

        try {
            setUploading(true);
            setResults(null);
            setStatus(null);

            let id = sessionId;
            let session;

            if (id && !isImageUpload) {
                session = await runPipelineSession(id);
            } else {
                session = await createPipelineSession(file);
            }

            id = session.id || session.sessionId;
            setSessionId(id);
            setStatus(session.status || "QUEUED");

            startPolling(id);
        } catch (err) {
            setError(err.message || "Error al analizar.");
        } finally {
            setUploading(false);
        }
    }

    /* ------------------------------ Markers ------------------------------ */

    const markers = useMemo(() => {
        if (!results?.topPatches) return [];
        return results.topPatches.slice(0, topCount).map((p, i) => {
            const x = p.normX ?? p.normx;
            const y = p.normY ?? p.normy;
            if (x == null || y == null) return null;
            return { id: i + 1, normX: x, normY: y };
        }).filter(Boolean);
    }, [results, topCount]);

    /* ------------------------------ Steps Animation ------------------------------ */

    const isBusy = status === "QUEUED" || status === "RUNNING" || uploading;

    const pipelineSteps = [
        "Creando miniparches",
        "Descartando miniparches vacíos",
        "Aplicando filtro de aptitud",
        "Generando diagnóstico"
    ];

    useEffect(() => {
        if (!isBusy || currentStep === pipelineSteps.length) {
            setDots("");
            return;
        }

        const int = setInterval(() => {
            setDots(prev => prev === "..." ? "" : prev + ".");
        }, 400);

        return () => clearInterval(int);
    }, [isBusy, currentStep]);

    useEffect(() => {
        if (!isBusy) {
            setCurrentStep(0);
            setAnalysisStartTime(null);
            return;
        }

        if (!analysisStartTime) {
            setAnalysisStartTime(Date.now());
            setCurrentStep(0);
            return;
        }

        const int = setInterval(() => {
            const elapsed = (Date.now() - analysisStartTime) / 1000;
            if (elapsed < 10) setCurrentStep(0);
            else if (elapsed < 25) setCurrentStep(1);
            else if (elapsed < 45) setCurrentStep(2);
            else setCurrentStep(3);
        }, 500);

        return () => clearInterval(int);
    }, [isBusy, analysisStartTime]);

    /* ------------------------------ UI: Processing ------------------------------ */

    const processingUI = (
        <div className="home__processing">
            <div className="home__status busy">
                <img src={loaderGif} className="home__loader" />
            </div>

            <div className="home__pipelineSteps">
                {pipelineSteps.map((step, i) => (
                    <div
                        key={i}
                        className={`home__pipelineStep ${
                            i < currentStep
                                ? "home__pipelineStep--completed"
                                : i === currentStep
                                    ? "home__pipelineStep--active"
                                    : "home__pipelineStep--pending"
                        }`}
                    >
                        {step}
                        {i === currentStep && i < pipelineSteps.length && (
                            <span className="home__pipelineStepDots">{dots}</span>
                        )}
                        {i < currentStep && <span className="home__pipelineStepCheck">✓</span>}
                    </div>
                ))}
            </div>

            <Button variant="muted" tone="blue" disabled>
                Analizando...
            </Button>
        </div>
    );

    /* ------------------------------ UI: Results ------------------------------ */

    const hasResults = status === "DONE" && results;

    const resultsUI = hasResults && (
        <section className="home__results">

            {/* HEADER */}
            <div className="home__resultsHeader">
                <div className="home__resultsTitleWrap">
                    <h2 className="home__resultsTitle">Nueva imagen</h2>
                    <button className="home__resultsTitleEdit">✏️</button>
                </div>

                <select
                    className="home__resultsSelect"
                    value={String(topCount)}
                    onChange={(e) => setTopCount(Number(e.target.value))}
                >
                    <option value="5">5 miniparches</option>
                    <option value="10">10 miniparches</option>
                </select>
            </div>

            {/* GRID */}
            <div className="home__resultsGrid">

                {/* PREVIEW */}
                <div className="home__resultsImageFrame">
                    {previewUrl ? (
                        <div className="home__resultsImageInner">
                            <img src={previewUrl} alt="preview" />

                            {markers.map(m => (
                                <div
                                    key={m.id}
                                    className="home__marker"
                                    style={{ left: `${m.normX * 100}%`, top: `${m.normY * 100}%` }}
                                >
                                    {m.id}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="home__resultsPlaceholder">Vista previa no disponible</div>
                    )}
                </div>

                {/* PANEL DERECHO: MINIPARCHES */}
                <div className="home__resultsPatchPanel">
                    <h3 className="home__patchTitle">Miniparches representativos</h3>

                    {results.topPatches?.slice(0, topCount).map((p, i) => (
                        <div key={i} className="home__patchItem">
                            <MiniPatch
                                sessionId={sessionId}
                                relPath={p.rel_path}
                                alt={`patch-${i + 1}`}
                            />
                            <div className="home__patchInfo">
                                <div className="home__patchCls">{p.cls || "—"}</div>
                                <div className="home__patchConf">{(p.conf ?? 0).toFixed(3)}</div>
                            </div>
                        </div>
                    ))}

                    {!results.topPatches?.length && (
                        <div className="home__patchPlaceholder">No hay miniparches</div>
                    )}
                </div>
            </div>

            {/* FOOTER */}
            <div className="home__resultsFooter">
                <div className="home__resultsDiagnosis">
                    <span className="home__resultsDiagnosisLabel">Diagnóstico posible:</span>
                    <span>{results.possibleDiagnosis || "—"}</span>
                </div>

                <div className="home__resultsLinks">
                    <button className="text-link">Ver estadísticas</button>
                    <button className="text-link">Descargar resultados</button>
                    <button className="text-link">Vista detallada</button>
                </div>
            </div>

            <div className="home__resultsActions">
                <Button variant="muted" tone="blue" onClick={clearFile}>
                    Realizar nuevo análisis
                </Button>
            </div>
        </section>
    );

    /* ------------------------------ MAIN RENDER ------------------------------ */

    return (
        <>
            <Header mode="auth" />

            <div className="home">

                {isBusy && processingUI}

                {!isBusy && hasResults && resultsUI}

                {!isBusy && !results && (
                    <>
                        <p className="home__lead">Empezá tu análisis</p>
                        {error && <div className="dropzone__error">{error}</div>}

                        <div
                            className={`dropzone ${dragOver ? "is-over" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                        >
                            <div className="dropzone__canvas">
                                {previewUrl ? (
                                    <img src={previewUrl} className="dropzone__img" />
                                ) : (
                                    <div className="dropzone__empty">
                                        <div className="dropzone__icon">⤴</div>
                                        <div className="dropzone__text">
                                            Arrastrá una imagen o{" "}
                                            <button className="text-link" onClick={() => inputRef.current.click()}>
                                                subí un archivo
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <input
                                ref={inputRef}
                                type="file"
                                className="dropzone__input"
                                accept={ACCEPT_EXT.join(",")}
                                onChange={onInputChange}
                            />
                        </div>

                        {file && (
                            <div className="home__fileRow">
                                <div className="home__filename">{file.name}</div>
                                <button className="home__remove" onClick={clearFile}>✖</button>
                            </div>
                        )}

                        <div className="home__actions">
                            <Button
                                variant="muted"
                                tone="blue"
                                disabled={!file || !!error}
                                onClick={onAnalyze}
                            >
                                Analizar
                            </Button>
                        </div>

                        <Modal open={showWelcome} onClose={closeWelcome}>
                            <div className="home__welcome">
                                <p>
                                    Bienvenido a CitoScan.<br />
                                    <a href="/info">Más información</a>
                                </p>
                                <label className="home__welcome-check">
                                    <input
                                        type="checkbox"
                                        checked={hideWelcome}
                                        onChange={(e) => setHideWelcome(e.target.checked)}
                                    />
                                    <span>No volver a mostrar</span>
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