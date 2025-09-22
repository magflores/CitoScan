import React from "react";
import "./Landing.css";
import Header from "../../components/Header/Header.jsx";


export default function Landing() {
    return (
        <div className="landing">
            <Header />
            <main className="landing__main container">
                <section className="section">
                    <h2 className="section__title">¿Qué es CitoScan?</h2>
                    <p className="section__p">
                        CitoScan es una plataforma diseñada para asistir al personal médico en el
                        análisis citológico de pruebas de Papanicolau (Pap). Utilizando modelos de
                        inteligencia artificial entrenados sobre imágenes reales, nuestra herramienta
                        permite subir un archivo escaneado y obtener una evaluación automática de la muestra.
                    </p>
                </section>


                <section className="section">
                    <h2 className="section__title">Subí tu imagen</h2>
                    <p className="section__p">
                        Para utilizar CitoScan y comenzar a analizar muestras, es necesario registrarse o
                        iniciar sesión. Nuestra plataforma está dirigida exclusivamente a profesionales de
                        la salud autorizados.
                    </p>
                </section>


                <section className="section">
                    <h2 className="section__title">Uso responsable</h2>
                    <p className="section__p">
                        El uso de esta plataforma es exclusivo para profesionales de la salud. CitoScan no
                        reemplaza el diagnóstico médico, sino que actúa como herramienta de apoyo. Al utilizar
                        la plataforma, el usuario se compromete a hacer un uso ético, confidencial y autorizado
                        de los resultados generados.
                    </p>
                </section>
            </main>
        </div>
    );
}