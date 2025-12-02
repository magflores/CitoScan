import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./ResetPassword.css";
import Button from "../../../components/Button/Button.jsx";
import FloatInput from "../../../components/FloatInput/FloatInput.jsx";
import logo from "../../../assets/citoIcon.svg";
import { resetPassword as resetPasswordApi, setToken } from "../../../features/auth/api";

const passStrongRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [form, setForm] = useState({
        password: "",
        password2: "",
    });
    const [touched, setTouched] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const token = searchParams.get("token");

    useEffect(() => {
        if (!token) {
            setError("Token de recuperación no proporcionado");
        }
    }, [token]);

    const setField = (name, value) => {
        const v = value.replace(/\s+/g, "");
        setForm((prev) => ({ ...prev, [name]: v }));
    };

    const passwordError =
        form.password && !passStrongRegex.test(form.password)
            ? "Debe incluir al menos una mayúscula, un número y un caracter especial."
            : "";
    const passwordMatchError =
        form.password && form.password2 && form.password !== form.password2
            ? "Las contraseñas no coinciden."
            : "";

    const allFilled = form.password && form.password2;
    const canSubmit =
        allFilled &&
        !passwordError &&
        !passwordMatchError &&
        token;

    async function onSubmit(e) {
        e.preventDefault();
        setTouched({
            password: true,
            password2: true,
        });
        setError("");
        if (!canSubmit) return;

        try {
            setLoading(true);
            const res = await resetPasswordApi({
                token: token,
                password: form.password,
            });

            if (res?.token) {
                setToken(res.token);
            }
            navigate("/home", { replace: true });
        } catch (err) {
            setError(err?.message ?? "No se pudo restablecer la contraseña.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="reset-password">
            <form className="reset-password__card" onSubmit={onSubmit} noValidate>
                <img src={logo} alt="Logo CitoScan" className="reset-password__logo" />
                <h1 className="reset-password__title">Restablecer contraseña</h1>

                {error && (
                    <div className="field-error" role="alert" aria-live="assertive" style={{ marginBottom: 12 }}>
                        {error}
                    </div>
                )}

                <div className="reset-password__fields">
                    <div className="field">
                        <FloatInput
                            id="password"
                            type="password"
                            label="Ingrese su nueva contraseña"
                            value={form.password}
                            onChange={(e) => setField("password", e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                            autoComplete="new-password"
                            disabled={loading}
                        />
                        {touched.password && passwordError && (
                            <div className="field-error">{passwordError}</div>
                        )}
                    </div>

                    <div className="field">
                        <FloatInput
                            id="password2"
                            type="password"
                            label="Repetir contraseña"
                            value={form.password2}
                            onChange={(e) => setField("password2", e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, password2: true }))}
                            autoComplete="new-password"
                            disabled={loading}
                        />
                        {touched.password2 && passwordMatchError && (
                            <div className="field-error">{passwordMatchError}</div>
                        )}
                    </div>
                </div>

                <div className="reset-password__actions">
                    <Button
                        type="submit"
                        variant="muted"
                        tone="pink"
                        disabled={!canSubmit || loading}
                        className="reset-password__submit"
                    >
                        {loading ? "Restableciendo..." : "Restablecer contraseña"}
                    </Button>
                </div>
            </form>
        </div>
    );
}

