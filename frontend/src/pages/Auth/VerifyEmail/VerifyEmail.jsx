import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./VerifyEmail.css";
import { verifyEmail as verifyEmailApi, setToken } from "../../../features/auth/api";
import logo from "../../../assets/citoIcon.svg";

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const token = searchParams.get("token");
        
        if (!token) {
            setError("Token de verificación no proporcionado");
            setLoading(false);
            return;
        }

        async function verify() {
            try {
                const res = await verifyEmailApi(token);
                
                if (res?.token && res?.verified) {
                    setToken(res.token);
                    setSuccess(true);
                    // Redirigir a home después de 2 segundos
                    setTimeout(() => {
                        navigate("/home", { replace: true });
                    }, 2000);
                } else {
                    setError(res?.message || "Error al verificar el email");
                }
            } catch (err) {
                const errorMessage = err?.message || "Error al verificar el email. El token puede haber expirado.";
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        }

        verify();
    }, [searchParams, navigate]);

    return (
        <div className="verify-email">
            <div className="verify-email__card">
                <img src={logo} alt="Logo CitoScan" className="verify-email__logo"/>
                <h1 className="verify-email__title">Verificación de Email</h1>

                {loading && (
                    <div className="verify-email__message">
                        <p>Verificando tu email...</p>
                    </div>
                )}

                {success && (
                    <div className="verify-email__success">
                        <p>¡Email verificado exitosamente!</p>
                        <p>Redirigiendo a la página principal...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="verify-email__error">
                        <p>{error}</p>
                        <a href="/login" className="verify-email__link">Ir a iniciar sesión</a>
                    </div>
                )}
            </div>
        </div>
    );
}

