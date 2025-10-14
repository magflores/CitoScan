import React, { useState } from "react";
import "./Login.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import { login } from "../../../features/auth/api";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passStrongRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [touched, setTouched] = useState({ email: false, password: false });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const canSubmit = email.trim() !== "" && password.trim() !== "";
    const emailError = touched.email && !emailRegex.test(email.trim()) ? "Ingresa un correo válido." : "";
    const passwordError = touched.password && !passStrongRegex.test(password)
        ? "Contraseña inválida. Debe incluir al menos una mayúscula, un número y un caracter especial."
        : "";

    async function onSubmit(e) {
        e.preventDefault();
        setTouched({ email: true, password: true });
        setError("");
        if (!canSubmit || emailError || passwordError) return;

        try {
            setLoading(true);
            const res = await login({ email: email.trim(), password });
            if (res?.token) localStorage.setItem("auth_token", res.token);
            window.location.assign("/");
        } catch (err) {
            setError(err?.message ?? "No se pudo iniciar sesión.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login">
            <form className="login__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="login__logo" />
                <h1 className="login__title">CitoScan</h1>

                {error && (
                    <div className="field-error" role="alert" aria-live="assertive" style={{ marginBottom: 12 }}>
                        {error}
                    </div>
                )}

                <div className="login__fields">
                    <div className="field">
                        <FloatInput
                            id="email"
                            label="Correo electrónico"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                            autoComplete="email"
                            disabled={loading}
                        />
                        {emailError && <div className="field-error">{emailError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="password"
                            label="Contraseña"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                            autoComplete="current-password"
                            disabled={loading}
                        />
                        {passwordError && <div className="field-error">{passwordError}</div>}
                    </div>
                </div>

                <a href="/forgot" className="login__link">¿Olvidaste tu contraseña?</a>

                <div className="login__actions">
                    <Button type="submit" variant="muted" tone="blue" disabled={!canSubmit || loading} className="login__submit">
                        {loading ? "Ingresando..." : "Iniciar sesión"}
                    </Button>

                    <div className="login__foot">
                        ¿No tienes una cuenta? <a href="/register" className="login__link">Regístrate aquí</a>
                    </div>
                </div>
            </form>
        </div>
    );
}
