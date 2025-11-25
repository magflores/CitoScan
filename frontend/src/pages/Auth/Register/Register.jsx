import React, {useMemo, useState} from "react";
import "./Register.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import {register as registerApi, login as loginApi, setToken} from "../../../features/auth/api";
import {useLocation, useNavigate} from "react-router-dom";

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
        institution: "",
    });
    const [touched, setTouched] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const navigate = useNavigate();
    const loc = useLocation();
    const redirectTo = loc.state?.from?.pathname || "/home";

    const setField = (name, value) => {
        let v = value;

        const noSpaces = ["email", "email2", "password", "password2"];
        const allowInner = ["firstName", "lastName", "institution"];

        if (noSpaces.includes(name)) {
            v = v.replace(/\s+/g, "");
        }

        if (allowInner.includes(name)) {
            v = v.replace(/^\s+/, "");
        }

        setForm((prev) => ({ ...prev, [name]: v }));
    };


    const firstNameError =
        form.firstName.trim() && !nameRegex.test(form.firstName.trim())
            ? "Usa solo letras y espacios."
            : "";
    const lastNameError =
        form.lastName.trim() && !nameRegex.test(form.lastName.trim())
            ? "Usa solo letras y espacios."
            : "";
    const emailError =
        form.email.trim() && !emailRegex.test(form.email.trim())
            ? "Ingresa un correo válido."
            : "";
    const emailMatchError =
        form.email.trim() && form.email2.trim() && form.email !== form.email2
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

    const allFilled = form.firstName && form.lastName && form.email && form.email2 && form.password && form.password2 && form.institution;
    const canSubmit =
        allFilled &&
        !firstNameError &&
        !lastNameError &&
        !emailError &&
        !emailMatchError &&
        !passwordError &&
        !passwordMatchError;

    async function onSubmit(e) {
        e.preventDefault();
        setTouched({
            firstName: true,
            lastName: true,
            email: true,
            email2: true,
            password: true,
            password2: true,
            institution: true
        });
        setError("");
        setSuccessMsg("");
        if (!canSubmit) return;

        try {
            setLoading(true);

            await registerApi({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                password: form.password,
                institution: form.institution.trim(),
            });

            const res = await loginApi({
                email: form.email.trim(),
                password: form.password,
            });

            if (res?.token) {
                setToken(res.token);
                navigate(redirectTo, {replace: true});
            } else {
                setError("Cuenta creada, pero no se produjo un error iniciando sesión.");
            }
        } catch (err) {
            setError(err?.message ?? "No se pudo completar el registro.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="reg">
            <form className="reg__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="reg__logo"/>
                <h1 className="reg__title">CitoScan</h1>

                {error && <div className="field-error" role="alert" aria-live="assertive"
                               style={{marginBottom: 12}}>{error}</div>}
                {successMsg && <div className="field-success" role="status" aria-live="polite"
                                    style={{marginBottom: 12}}>{successMsg}</div>}

                <div className="reg__grid">
                    <div className="field">
                        <FloatInput id="firstName" label="Nombre" value={form.firstName}
                                    onChange={(e) => setField("firstName", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, firstName: true}))}
                                    autoComplete="given-name" disabled={loading}/>
                        {touched.firstName && firstNameError && (
                            <div className="field-error">{firstNameError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput id="lastName" label="Apellido" value={form.lastName}
                                    onChange={(e) => setField("lastName", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, lastName: true}))}
                                    autoComplete="family-name" disabled={loading}/>
                        {touched.lastName && lastNameError && (
                            <div className="field-error">{lastNameError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput id="email" type="email" label="Correo electrónico" value={form.email}
                                    onChange={(e) => setField("email", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, email: true}))} autoComplete="email"
                                    disabled={loading}/>
                        {touched.email && emailError && (
                            <div className="field-error">{emailError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput id="email2" type="email" label="Repite tu correo electrónico" value={form.email2}
                                    onChange={(e) => setField("email2", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, email2: true}))} autoComplete="email"
                                    disabled={loading}/>
                        {touched.email2 && emailMatchError && (
                            <div className="field-error">{emailMatchError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput id="password" type="password" label="Contraseña" value={form.password}
                                    onChange={(e) => setField("password", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, password: true}))}
                                    autoComplete="new-password" disabled={loading}/>
                        {touched.password && passwordError && (
                            <div className="field-error">{passwordError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput id="password2" type="password" label="Repite tu contraseña" value={form.password2}
                                    onChange={(e) => setField("password2", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, password2: true}))}
                                    autoComplete="new-password" disabled={loading}/>
                        {touched.password2 && passwordMatchError && (
                            <div className="field-error">{passwordMatchError}</div>
                        )}
                    </div>

                    <div className="reg__span2 field">
                        <FloatInput id="institution" label="Hospital/Institución" value={form.institution}
                                    onChange={(e) => setField("institution", e.target.value)}
                                    onBlur={() => setTouched((t) => ({...t, institution: true}))}
                                    autoComplete="organization" disabled={loading}/>
                        {touched.institution && !form.institution.trim() && (
                            <div className="field-error">Este campo es obligatorio.</div>
                        )}
                    </div>
                </div>

                <div className="reg__actions">
                    <Button type="submit" variant="muted" tone="pink" disabled={!canSubmit || loading}
                            className="reg__submit">
                        {loading ? "Creando cuenta..." : "Registrarme"}
                    </Button>

                    <div className="reg__foot">
                        ¿Ya tienes una cuenta? <a href="/login" className="reg__link">Inicia sesión aquí</a>
                    </div>
                </div>
            </form>
        </div>
    );
}
