import React, { useState } from "react";
import "./Login.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";


export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");


    const canSubmit = email.trim() !== "" && password.trim() !== "";


    function onSubmit(e) {
        e.preventDefault();
        if (!canSubmit) return;
        // TODO: endpoint
        console.log({ email, password });
    }


    return (
        <div className="login">
            <form className="login__card" onSubmit={onSubmit}>
                <img src={logo} alt="Logo CitoScan" className="login__logo" />
                <h1 className="login__title">CitoScan</h1>


                <div className="login__fields">
                    <FloatInput
                        id="email"
                        label="Correo electrónico"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                    />


                    <FloatInput
                        id="password"
                        label="Contraseña"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                    />
                </div>


                <a href="/forgot" className="login__link">¿Olvidaste tu contraseña?</a>


                <Button type="submit" variant="muted" tone="blue" disabled={!canSubmit} className="login__submit">
                    Iniciar sesión
                </Button>


                <div className="login__foot">
                    ¿No tienes una cuenta? <a href="/register" className="login__link">Regístrate aquí</a>
                </div>
            </form>
        </div>
    );
}