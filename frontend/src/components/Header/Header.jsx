import React from "react";
import "./Header.css";
import logo from "../../assets/citoIcon.svg";
import Button from "../Button/Button.jsx";


export default function Header() {
    return (
        <header className="hdr">
            <div className="hdr__brand">
                <img src={logo} alt="Logo CitoScan" className="hdr__logo" />
                <span className="hdr__name">CitoScan</span>
            </div>
            <nav className="hdr__actions">
                <Button to="/login" variant="outline" tone="pink">Iniciar sesión</Button>
                <Button to="/register" variant="muted"  tone="blue">Registrarse</Button>

            </nav>
        </header>
    );
}