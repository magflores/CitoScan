import React, { useEffect, useState } from "react";
import "./MiniPatch.css";
import { fetchPipelinePatch } from "../../features/auth/api";

export default function MiniPatch({ sessionId, relPath, alt }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!sessionId || !relPath) return;

        let cancelled = false;
        let objectUrl = null;

        (async () => {
            try {
                const blob = await fetchPipelinePatch(sessionId, relPath);
                if (cancelled) return;

                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            } catch (err) {
                if (!cancelled) setError(err.message || "Error");
            }
        })();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [sessionId, relPath]);

    if (error) {
        return <div className="miniPatch miniPatch--error">Error</div>;
    }

    if (!url) {
        return <div className="miniPatch miniPatch--loading" />;
    }

    return <img src={url} alt={alt} className="miniPatch" />;
}