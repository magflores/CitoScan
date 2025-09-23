import React, { useMemo, useState } from "react";
import "./Register.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";

const nameRegex = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passStrongRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function Register() {
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        email2: "",
        password: "",
        password2: "",
        org: "",
    });

    const setField = (name, value) =>
        setForm((prev) => ({ ...prev, [name]: value }));

    const firstNameError =
        form.firstName && !nameRegex.test(form.firstName.trim())
            ? "Usa solo letras y espacios."
            : "";

    const lastNameError =
        form.lastName && !nameRegex.test(form.lastName.trim())
            ? "Usa solo letras y espacios."
            : "";

    const emailError =
        form.email && !emailRegex.test(form.email.trim())
            ? "Ingresa un correo válido."
            : "";

    const emailMatchError =
        form.email && form.email2 && form.email !== form.email2
            ? "Los correos no coinciden."
            : "";

    const passwordError =
        form.password && !passStrongRegex.test(form.password)
            ? "Debe incluir al menos una mayúscula, un número y un caracter especial."
            : "";

    const passwordMatchError =
        form.password && form.password2 && form.password !== form.password2
            ? "Las contraseñas no coinciden."
            : "";

    const allFilled =
        form.firstName &&
        form.lastName &&
        form.email &&
        form.email2 &&
        form.password &&
        form.password2 &&
        form.org;

    const emailMatch = useMemo(
        () => form.email.trim() !== "" && form.email === form.email2,
        [form.email, form.email2]
    );
    const passMatch = useMemo(
        () => form.password.trim() !== "" && form.password === form.password2,
        [form.password, form.password2]
    );

    const canSubmit =
        allFilled &&
        !firstNameError &&
        !lastNameError &&
        !emailError &&
        emailMatch &&
        !passwordError &&
        passMatch;

    function onSubmit(e) {
        e.preventDefault();
        if (!canSubmit) return;
        // TODO: endpoint
        console.log("register", form);
    }

    return (
        <div className="reg">
            <form className="reg__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="reg__logo" />
                <h1 className="reg__title">CitoScan</h1>

                <div className="reg__grid">
                    <div className="field">
                        <FloatInput
                            id="firstName"
                            label="Nombre"
                            value={form.firstName}
                            onChange={(e) => setField("firstName", e.target.value)}
                            autoComplete="given-name"
                        />
                        {firstNameError && (
                            <div className="field-error">{firstNameError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="lastName"
                            label="Apellido"
                            value={form.lastName}
                            onChange={(e) => setField("lastName", e.target.value)}
                            autoComplete="family-name"
                        />
                        {lastNameError && (
                            <div className="field-error">{lastNameError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="email"
                            type="email"
                            label="Correo electrónico"
                            value={form.email}
                            onChange={(e) => setField("email", e.target.value)}
                            autoComplete="email"
                        />
                        {emailError && <div className="field-error">{emailError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="email2"
                            type="email"
                            label="Repite tu correo electrónico"
                            value={form.email2}
                            onChange={(e) => setField("email2", e.target.value)}
                            autoComplete="email"
                        />
                        {emailMatchError && (
                            <div className="field-error">{emailMatchError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="password"
                            type="password"
                            label="Contraseña"
                            value={form.password}
                            onChange={(e) => setField("password", e.target.value)}
                            autoComplete="new-password"
                        />
                        {passwordError && (
                            <div className="field-error">{passwordError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="password2"
                            type="password"
                            label="Repite tu contraseña"
                            value={form.password2}
                            onChange={(e) => setField("password2", e.target.value)}
                            autoComplete="new-password"
                        />
                        {passwordMatchError && (
                            <div className="field-error">{passwordMatchError}</div>
                        )}
                    </div>

                    <div className="reg__span2 field">
                        <FloatInput
                            id="org"
                            label="Hospital/Institución"
                            value={form.org}
                            onChange={(e) => setField("org", e.target.value)}
                            autoComplete="organization"
                        />
                    </div>
                </div>

                <div className="reg__actions">
                    <Button
                        type="submit"
                        variant="muted"
                        tone="pink"
                        disabled={!canSubmit}
                        className="reg__submit"
                    >
                        Registrarme
                    </Button>

                    <div className="reg__foot">
                        ¿Ya tienes una cuenta?{" "}
                        <a href="/login" className="reg__link">
                            Inicia sesión aquí
                        </a>
                    </div>
                </div>
            </form>
        </div>
    );
}