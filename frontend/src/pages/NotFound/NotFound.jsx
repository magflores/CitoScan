import React from "react";
import "./NotFound.css";
import Button from "../../components/Button/Button.jsx";


export default function NotFound() {
    return (
        <div className="nf">
            <div className="nf__card">
                <h1 className="nf__title">Página no encontrada</h1>
                <p className="nf__p">La ruta solicitada no está disponible.</p>
                <Button to="/" variant="primary" className="nf__btn">Volver al inicio</Button>
            </div>
        </div>
    );
}