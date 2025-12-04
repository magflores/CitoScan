import React, { useState, useEffect, useRef } from "react";
import {Link, NavLink, useNavigate} from "react-router-dom";
import Button from "../Button/Button.jsx";
import "./Header.css";
import logo from "../../assets/citoIcon.svg";
import {clearToken} from "../../features/auth/api.js";

export default function Header({ mode = "public" }) {
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    function onLogout() {
        clearToken();
        navigate("/login", { replace: true });
    }

    function handleProfileClick() {
        navigate("/profile");
        setDropdownOpen(false);
    }

    // Cerrar dropdown al hacer click fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        }

        if (dropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownOpen]);

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

                    <div className="hdr__dropdown" ref={dropdownRef}>
                        <button
                            className="hdr__avatarBtn"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            aria-label="Menú de usuario"
                            aria-expanded={dropdownOpen}
                        >
                            <span className="hdr__avatarCircle">👤</span>
                        </button>
                        {dropdownOpen && (
                            <div className="hdr__dropdownMenu">
                                <button
                                    className="hdr__dropdownItem"
                                    onClick={handleProfileClick}
                                >
                                    Mi perfil
                                </button>
                                <button
                                    className="hdr__dropdownItem"
                                    onClick={onLogout}
                                >
                                    Cerrar sesión
                                </button>
                            </div>
                        )}
                    </div>
                </nav>
            )}
        </header>
    );
}
