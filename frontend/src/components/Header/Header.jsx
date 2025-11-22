import React from "react";
import {Link, NavLink, useNavigate} from "react-router-dom";
import Button from "../Button/Button.jsx";
import "./Header.css";
import logo from "../../assets/citoIcon.svg";
import {clearToken} from "../../features/auth/api.js";

export default function Header({ mode = "public" }) {
    const navigate = useNavigate();

    function onLogout() {
        clearToken();
        navigate("/login", { replace: true });
    }


    return (
        <header className="hdr">
            <Link to="/" className="hdr__brand" aria-label="Inicio">
                <img src={logo} alt="" className="hdr__logo" />
                <span className="hdr__name">CitoScan</span>
            </Link>

            {mode === "public" ? (
                <div className="hdr__actions">
                    <Button to="/login" variant="outline" tone="pink">Iniciar sesión</Button>
                    <Button to="/register" variant="muted" tone="blue">Registrarse</Button>
                </div>
            ) : (
                <nav className="hdr__nav">
                    <NavLink to="/home" className={({isActive}) => "hdr__tab" + (isActive ? " is-active" : "")}>
                        HOME
                    </NavLink>
                    <NavLink to="/info" className={({isActive}) => "hdr__tab" + (isActive ? " is-active" : "")}>
                        INFO
                    </NavLink>

                    <Link to="/profile" className="hdr__avatar" aria-label="Perfil">
                        <span className="hdr__avatarCircle">👤</span>
                    </Link>
                    <Button onClick={onLogout}>Cerrar sesión</Button>
                </nav>
            )}
        </header>
    );
}
