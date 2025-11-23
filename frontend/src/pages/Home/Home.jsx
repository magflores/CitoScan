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
    const [currentStep, setCurrentStep] = useState(0); // 0-3 para los pasos del pipeline
    const [analysisStartTime, setAnalysisStartTime] = useState(null);
    const [dots, setDots] = useState('');

    const inputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const pollRef = useRef(null);

    /* ---------------------- Welcome modal ---------------------- */
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

    /* ---------------------- File validation ---------------------- */
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
            setError("El archivo supera el máximo permitido de 5GB.");
            clearFile();
            return;
        }

        if (previewUrl) URL.revokeObjectURL(previewUrl);

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
            return;
        }

        setLoadingPreview(true);
        try {
            const session = await createPipelineSessionPreview(f);
            const id = session.id || session.sessionId;
            if (!id) throw new Error("No se obtuvo ID de la sesión de preview.");

            setSessionId(id);
            setStatus(session.status || "UPLOADED");

            const blob = await fetchPipelinePreview(id);
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
        } catch (e) {
            setError(e.message || "No se pudo generar la vista previa.");
        } finally {
            setLoadingPreview(false);
        }
    }

    /* ---------------------- Polling ---------------------- */
    function stopPolling() {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
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

    // Pasos del pipeline
    const pipelineSteps = [
        "Creando miniparches",
        "Descartando miniparches vacíos",
        "Aplicando filtro de aptitud",
        "Generando diagnóstico"
    ];

    // Animación de puntos
    useEffect(() => {
        if (!isBusy || currentStep === pipelineSteps.length) {
            setDots('');
            return;
        }

        const interval = setInterval(() => {
            setDots(prev => {
                if (prev === '') return '.';
                if (prev === '.') return '..';
                if (prev === '..') return '...';
                return '';
            });
        }, 500);

        return () => clearInterval(interval);
    }, [isBusy, currentStep, pipelineSteps.length]);

    // Actualizar el paso actual basado en el tiempo transcurrido
    useEffect(() => {
        if (!isBusy) {
            setCurrentStep(0);
            setAnalysisStartTime(null);
            return;
        }

        if (analysisStartTime === null) {
            setAnalysisStartTime(Date.now());
            setCurrentStep(0);
            return;
        }

        const interval = setInterval(() => {
            const elapsed = (Date.now() - analysisStartTime) / 1000; // segundos
            
            // Simular progreso de pasos basado en tiempo
            // Ajustar estos tiempos según la duración real esperada
            if (elapsed < 10) {
                setCurrentStep(0);
            } else if (elapsed < 25) {
                setCurrentStep(1);
            } else if (elapsed < 45) {
                setCurrentStep(2);
            } else {
                setCurrentStep(3);
            }
        }, 500);

        return () => clearInterval(interval);
    }, [isBusy, analysisStartTime, status]);
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
            setStatus(s.status);

            if (s.status === "DONE") {
                stopPolling();
                setCurrentStep(4); // Marcar todos los pasos como completados (4 = todos los pasos)
                try {
                    const r = await getPipelineResults(id);
                    setResults(r);
                } catch (e) {
                    setError(e.message || "No se pudieron obtener los resultados.");
                }
            } else if (s.status === "ERROR") {
                stopPolling();
            }
        } catch (err) {
            setError(err.message || "No se pudo actualizar el estado.");
            stopPolling();
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
            setStatus(null);
            setResults(null);

            let id = sessionId;
            let session;

            if (id && !isImageUpload) {
                session = await runPipelineSession(id);
            } else {
                session = await createPipelineSession(file);
            }

            id = session.id || session.sessionId || id;
            setSessionId(id);
            setStatus(session.status || "QUEUED");

            if (id) startPolling(id);
        } catch (e) {
            setError(e.message || "Error al iniciar análisis.");
        } finally {
            setUploading(false);
        }
    }

    /* ---------------------- Markers ---------------------- */
    const markers = useMemo(() => {
        if (!results?.topPatches) return [];
        return results.topPatches.slice(0, topCount).map((p, i) => {
            const nx = p.normX ?? p.normx;
            const ny = p.normY ?? p.normy;
            if (nx == null || ny == null) return null;
            return { id: i + 1, normX: nx, normY: ny };
        }).filter(Boolean);
    }, [results, topCount]);

    /* ---------------------- Drag/Drop ---------------------- */
    function onDrop(e) {
        e.preventDefault();
        setDragOver(false);
        validateAndSet(e.dataTransfer.files?.[0]);
    }

    const processingUI = (
        <div className="home__processing">
            <div className="home__status busy" aria-live="polite">
                <img src={loaderGif} alt="" className="home__loader" />
            </div>
            <div className="home__pipelineSteps">
                {pipelineSteps.map((step, index) => (
                    <div
                        key={index}
                        className={`home__pipelineStep ${
                            index < currentStep
                                ? "home__pipelineStep--completed"
                                : index === currentStep && currentStep < pipelineSteps.length
                                ? "home__pipelineStep--active"
                                : "home__pipelineStep--pending"
                        }`}
                    >
                        {step}
                        {index === currentStep && currentStep < pipelineSteps.length && (
                            <span className="home__pipelineStepDots">{dots}</span>
                        )}
                        {index < currentStep && (
                            <span className="home__pipelineStepCheck"> ✓</span>
                        )}
                    </div>
                ))}
            </div>
            <div className="home__actions">
                <Button variant="muted" tone="blue" disabled className="home__analyze">
                    Analizando...
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
                        <button type="button" className="home__resultsTitleEdit">✏️</button>
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
                    <div className="home__resultsImageFrame">
                        {previewUrl ? (
                            <div className="home__resultsImageInner">
                                <img src={previewUrl} alt="preview" />

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

                    {/* Panel derecho: miniparches */}
                    <div className="home__resultsPatchPanel">
                        <h3>Miniparches representativos</h3>

                        {results?.topPatches?.slice(0, topCount).map((p, i) => (
                            <div key={i} className="home__patchItem">
                                <MiniPatch
                                    sessionId={sessionId}
                                    relPath={p.rel_path}
                                    alt={`patch ${i + 1}`}
                                />
                                <div className="home__patchInfo">
                                    <div>{p.cls || "—"}</div>
                                    <div>{(p.conf ?? 0).toFixed(3)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="home__resultsFooter">
                    <div className="home__resultsDiagnosis">
                        <span className="home__resultsDiagnosisLabel">
                            Diagnóstico posible:
                        </span>
                        <span>{results.possibleDiagnosis || "—"}</span>
                    </div>

                    <div className="home__resultsLinks">
                        <button className="text-link">Ver estadísticas</button>
                        <button className="text-link">Descargar resultados</button>
                        <button className="text-link">Vista detallada</button>
                    </div>
                </div>

                <div className="home__resultsActions">
                    <Button variant="muted" tone="blue" onClick={() => clearFile()}>
                        Realizar nuevo análisis
                    </Button>
                </div>
            </section>
        );

    /* ---------------------- Main render ---------------------- */
    return (
        <>
            <Header mode="auth" />

            <div className="home">
                {uploading || status === "QUEUED" || status === "RUNNING"
                    ? (
                        <div className="home__processing">
                            <div className="home__status busy">
                                <img src={loaderGif} className="home__loader" />
                            </div>
                        </div>
                    )
                    : hasResults
                        ? resultsUI
                        : (
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
                                            <img
                                                src={previewUrl}
                                                className="dropzone__img"
                                            />
                                        ) : (
                                            <div className="dropzone__empty">
                                                <div className="dropzone__icon">⤴</div>
                                                <div className="dropzone__text">
                                                    Arrastrá una imagen o{" "}
                                                    <button
                                                        className="text-link"
                                                        onClick={browseFile}
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
                                        className="dropzone__input"
                                        accept={ACCEPT_EXT.join(",")}
                                        onChange={(e) => validateAndSet(e.target.files?.[0])}
                                    />
                                </div>
                            ) : (
                                <div className="home__fileRow">
                                    <div 
                                        className={`home__filename ${loadingPreview ? 'home__filename--loading' : ''}`} 
                                        title={file.name}
                                    >
                                        {file.name}
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
                                            <a href="/info">Más información</a>.
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