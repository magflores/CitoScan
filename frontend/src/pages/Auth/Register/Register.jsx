import React, { useMemo, useState } from "react";
import "./Register.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import { register as registerApi } from "../../../features/auth/api";

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

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    const firstNameError = touched.firstName && form.firstName && !nameRegex.test(form.firstName.trim())
        ? "Usa solo letras y espacios." : "";
    const lastNameError = touched.lastName && form.lastName && !nameRegex.test(form.lastName.trim())
        ? "Usa solo letras y espacios." : "";
    const emailError = touched.email && form.email && !emailRegex.test(form.email.trim())
        ? "Ingresa un correo válido." : "";
    const emailMatchError = touched.email2 && form.email && form.email2 && form.email !== form.email2
        ? "Los correos no coinciden." : "";
    const passwordError = touched.password && form.password && !passStrongRegex.test(form.password)
        ? "Debe incluir al menos una mayúscula, un número y un caracter especial." : "";
    const passwordMatchError = touched.password2 && form.password && form.password2 && form.password !== form.password2
        ? "Las contraseñas no coinciden." : "";

    const allFilled = form.firstName && form.lastName && form.email && form.email2 && form.password && form.password2 && form.institution;
    const emailMatch = useMemo(() => form.email.trim() !== "" && form.email === form.email2, [form.email, form.email2]);
    const passMatch = useMemo(() => form.password.trim() !== "" && form.password === form.password2, [form.password, form.password2]);
    const canSubmit = allFilled && !firstNameError && !lastNameError && !emailError && emailMatch && !passwordError && passMatch;

    async function onSubmit(e) {
        e.preventDefault();
        setTouched({ firstName: true, lastName: true, email: true, email2: true, password: true, password2: true, institution: true });
        setError(""); setSuccessMsg("");
        if (!canSubmit) return;

        try {
            setLoading(true);
            const res = await registerApi({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                password: form.password,
                institution: form.institution.trim(),
            });
            setSuccessMsg("¡Registro exitoso! Ya puedes iniciar sesión.");
            setTimeout(() => { window.location.assign("/login"); }, 800);
        } catch (err) {
            setError(err?.message ?? "No se pudo completar el registro.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="reg">
            <form className="reg__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="reg__logo" />
                <h1 className="reg__title">CitoScan</h1>

                {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginBottom: 12 }}>{error}</div>}
                {successMsg && <div className="field-success" role="status" aria-live="polite" style={{ marginBottom: 12 }}>{successMsg}</div>}

                <div className="reg__grid">
                    <div className="field">
                        <FloatInput id="firstName" label="Nombre" value={form.firstName}
                                    onChange={(e) => setField("firstName", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, firstName: true }))} autoComplete="given-name" disabled={loading} />
                        {firstNameError && <div className="field-error">{firstNameError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput id="lastName" label="Apellido" value={form.lastName}
                                    onChange={(e) => setField("lastName", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, lastName: true }))} autoComplete="family-name" disabled={loading} />
                        {lastNameError && <div className="field-error">{lastNameError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput id="email" type="email" label="Correo electrónico" value={form.email}
                                    onChange={(e) => setField("email", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, email: true }))} autoComplete="email" disabled={loading} />
                        {emailError && <div className="field-error">{emailError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput id="email2" type="email" label="Repite tu correo electrónico" value={form.email2}
                                    onChange={(e) => setField("email2", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, email2: true }))} autoComplete="email" disabled={loading} />
                        {emailMatchError && <div className="field-error">{emailMatchError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput id="password" type="password" label="Contraseña" value={form.password}
                                    onChange={(e) => setField("password", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, password: true }))} autoComplete="new-password" disabled={loading} />
                        {passwordError && <div className="field-error">{passwordError}</div>}
                    </div>

                    <div className="field">
                        <FloatInput id="password2" type="password" label="Repite tu contraseña" value={form.password2}
                                    onChange={(e) => setField("password2", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, password2: true }))} autoComplete="new-password" disabled={loading} />
                        {passwordMatchError && <div className="field-error">{passwordMatchError}</div>}
                    </div>

                    <div className="reg__span2 field">
                        <FloatInput id="institution" label="Hospital/Institución" value={form.institution}
                                    onChange={(e) => setField("institution", e.target.value)}
                                    onBlur={() => setTouched((t) => ({ ...t, institution: true }))} autoComplete="organization" disabled={loading} />
                    </div>
                </div>

                <div className="reg__actions">
                    <Button type="submit" variant="muted" tone="pink" disabled={!canSubmit || loading} className="reg__submit">
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
