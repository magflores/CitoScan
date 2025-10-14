import React, { useState } from "react";
import "./Login.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import { login } from "../../../features/auth/api";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const canSubmit = email.trim() !== "" && password.trim() !== "";

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        if (!canSubmit) return;

        try {
            setLoading(true);
            const res = await login({ email: email.trim(), password });
            if (res?.token) {
                localStorage.setItem("auth_token", res.token);
            }
            navigate("/home", { replace: true });
        } catch (err) {
            const status = err?.status ?? err?.response?.status;
            setError(status === 401 ? "Credenciales inválidas" : err?.message);
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
                    </div>
                </div>

                <Link to="/forgot" className="login__link">¿Olvidaste tu contraseña?</Link>

                <div className="login__actions">
                    <Button type="submit" variant="muted" tone="blue" disabled={!canSubmit || loading} className="login__submit">
                        {loading ? "Ingresando..." : "Iniciar sesión"}
                    </Button>

                    <div className="login__foot">
                        ¿No tienes una cuenta? <Link to="/register" className="login__link">Regístrate aquí</Link>
                    </div>
                </div>
            </form>
        </div>
    );
}
