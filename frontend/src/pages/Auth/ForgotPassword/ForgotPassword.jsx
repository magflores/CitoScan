import React, { useState } from "react";
import "./ForgotPassword.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import { forgotPassword as forgotPasswordApi } from "../../../features/auth/api";
import { Link } from "react-router-dom";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const emailError = email.trim() && !emailRegex.test(email.trim())
        ? "Ingresa un correo válido."
        : "";

    const canSubmit = email.trim() !== "" && !emailError;

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        if (!canSubmit) return;

        try {
            setLoading(true);
            await forgotPasswordApi({ email: email.trim() });
            setSuccessMsg("Si el correo electrónico existe en nuestro sistema, recibirás un email con instrucciones para restablecer tu contraseña.");
            setEmail("");
        } catch (err) {
            setError(err?.message ?? "No se pudo procesar la solicitud.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="forgot-password">
            <form className="forgot-password__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="forgot-password__logo" />
                <h1 className="forgot-password__title">Recuperar contraseña</h1>

                {error && (
                    <div className="field-error" role="alert" aria-live="assertive" style={{ marginBottom: 12 }}>
                        {error}
                    </div>
                )}
                {successMsg && (
                    <div className="field-success" role="status" aria-live="polite" style={{ marginBottom: 12 }}>
                        {successMsg}
                    </div>
                )}

                <div className="forgot-password__fields">
                    <div className="field">
                        <FloatInput
                            id="email"
                            label="Correo electrónico"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value.replace(/\s+/g, ""))}
                            autoComplete="email"
                            disabled={loading}
                        />
                        {emailError && (
                            <div className="field-error">{emailError}</div>
                        )}
                    </div>
                </div>

                <div className="forgot-password__actions">
                    <Button 
                        type="submit" 
                        variant="muted" 
                        tone="pink" 
                        disabled={!canSubmit || loading} 
                        className="forgot-password__submit"
                    >
                        {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                    </Button>

                    <div className="forgot-password__foot">
                        <Link to="/login" className="forgot-password__link">Volver a iniciar sesión</Link>
                    </div>
                </div>
            </form>
        </div>
    );
}

