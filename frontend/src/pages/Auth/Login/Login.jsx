import React, { useState } from "react";
import "./Login.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passStrongRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [attempted, setAttempted] = useState(false);

    const canSubmit = email.trim() !== "" && password.trim() !== "";

    const emailError =
        attempted && !emailRegex.test(email.trim()) ? "Ingresa un correo válido." : "";
    const passwordError =
        attempted && !passStrongRegex.test(password)
            ? "Contraseña inválida. Debe incluir al menos una mayúscula, un número y un caracter especial."
            : "";

    function onSubmit(e) {
        e.preventDefault();
        if (!canSubmit) return;

        setAttempted(true);

        const valid =
            emailRegex.test(email.trim()) && passStrongRegex.test(password);

        if (!valid) return;

        // TODO: endpoint
        console.log({ email, password });
    }

    return (
        <div className="login">
            <form className="login__card" onSubmit={onSubmit}>
                <img src={logo} alt="Logo CitoScan" className="login__logo" />
                <h1 className="login__title">CitoScan</h1>

                <div className="login__fields">
                    <div className="field">
                        <FloatInput
                            id="email"
                            label="Correo electrónico"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
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
                            autoComplete="current-password"
                        />
                        {passwordError && (
                            <div className="field-error">{passwordError}</div>
                        )}
                    </div>
                </div>

                <a href="/forgot" className="login__link">
                    ¿Olvidaste tu contraseña?
                </a>

                <div className="login__actions">
                    <Button
                        type="submit"
                        variant="muted"
                        tone="blue"
                        disabled={!canSubmit}
                        className="login__submit"
                    >
                        Iniciar sesión
                    </Button>

                    <div className="login__foot">
                        ¿No tienes una cuenta?{" "}
                        <a href="/register" className="login__link">
                            Regístrate aquí
                        </a>
                    </div>
                </div>
            </form>
        </div>
    );
}
