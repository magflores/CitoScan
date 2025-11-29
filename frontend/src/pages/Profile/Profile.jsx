import React, { useState, useEffect } from "react";
import "./Profile.css";
import Header from "../../components/Header/Header.jsx";
import Button from "../../components/Button/Button.jsx";
import FloatInput from "../../components/FloatInput/FloatInput.jsx";
import { getCurrentUser, updateProfile } from "../../features/auth/api";

export default function Profile() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [user, setUser] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        institution: "",
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            try {
                setLoading(true);
                const userData = await getCurrentUser();
                setUser(userData);
                setForm({
                    firstName: userData.firstName || "",
                    lastName: userData.lastName || "",
                    email: userData.email || "",
                    password: "",
                    institution: userData.institution || "",
                });
            } catch (err) {
                console.warn("No se pudo cargar el perfil:", err);
                setError("No se pudo cargar la información del perfil. El endpoint puede no estar disponible aún.");
            } finally {
                setLoading(false);
            }
        }
        fetchUser();
    }, []);

    async function handleSave() {
        try {
            setSaving(true);
            setError("");
            // Solo enviar password si se cambió (no está vacío)
            const updateData = {
                firstName: form.firstName,
                lastName: form.lastName,
                institution: form.institution,
            };
            if (form.password && form.password.trim() !== "") {
                updateData.password = form.password;
            }
            const updatedUser = await updateProfile(updateData);
            setUser(updatedUser);
            setForm({
                ...form,
                password: "", // Limpiar contraseña después de guardar
            });
            setEditing(false);
        } catch (err) {
            setError(err?.message || "No se pudo guardar los cambios.");
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() {
        if (user) {
            setForm({
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                email: user.email || "",
                password: "",
                institution: user.institution || "",
            });
        }
        setEditing(false);
        setError("");
    }

    if (loading) {
        return (
            <>
                <Header mode="auth" />
                <div className="profile">
                    <div className="profile__loading">Cargando perfil...</div>
                </div>
            </>
        );
    }

    return (
        <>
            <Header mode="auth" />
            <div className="profile">
                <div className="profile__container">
                    <h1 className="profile__title">Mi Perfil</h1>

                    {error && (
                        <div className="profile__error" role="alert">
                            {error}
                        </div>
                    )}

                    {!user && !error && (
                        <div className="profile__empty">
                            <p>No se encontró información del usuario.</p>
                        </div>
                    )}

                    {user && (
                        <div className="profile__content">
                            <div className="profile__section">
                                <div className="profile__avatar">
                                    <span className="profile__avatarCircle">
                                        {user.firstName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "👤"}
                                    </span>
                                </div>

                                {!editing ? (
                                    <div className="profile__info">
                                        <div className="profile__infoRow">
                                            <span className="profile__label">Nombre:</span>
                                            <span className="profile__value">
                                                {user.firstName || "—"}
                                            </span>
                                        </div>
                                        <div className="profile__infoRow">
                                            <span className="profile__label">Apellido:</span>
                                            <span className="profile__value">
                                                {user.lastName || "—"}
                                            </span>
                                        </div>
                                        <div className="profile__infoRow">
                                            <span className="profile__label">Correo electrónico:</span>
                                            <span className="profile__value">
                                                {user.email || "—"}
                                            </span>
                                        </div>
                                        <div className="profile__infoRow">
                                            <span className="profile__label">Contraseña:</span>
                                            <span className="profile__value">
                                                ••••••••
                                            </span>
                                        </div>
                                        <div className="profile__infoRow">
                                            <span className="profile__label">Institución:</span>
                                            <span className="profile__value">
                                                {user.institution || "—"}
                                            </span>
                                        </div>

                                        <div className="profile__actions">
                                            <Button
                                                variant="outline"
                                                tone="blue"
                                                onClick={() => setEditing(true)}
                                            >
                                                Editar perfil
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="profile__edit">
                                        <div className="profile__fields">
                                            <div className="field">
                                                <FloatInput
                                                    id="firstName"
                                                    label="Nombre"
                                                    value={form.firstName}
                                                    onChange={(e) =>
                                                        setForm({ ...form, firstName: e.target.value })
                                                    }
                                                    autoComplete="given-name"
                                                    disabled={saving}
                                                />
                                            </div>

                                            <div className="field">
                                                <FloatInput
                                                    id="lastName"
                                                    label="Apellido"
                                                    value={form.lastName}
                                                    onChange={(e) =>
                                                        setForm({ ...form, lastName: e.target.value })
                                                    }
                                                    autoComplete="family-name"
                                                    disabled={saving}
                                                />
                                            </div>

                                            <div className="field">
                                                <FloatInput
                                                    id="email"
                                                    type="email"
                                                    label="Correo electrónico"
                                                    value={form.email}
                                                    onChange={(e) =>
                                                        setForm({ ...form, email: e.target.value })
                                                    }
                                                    autoComplete="email"
                                                    disabled={true}
                                                    className="profile__emailDisabled"
                                                />
                                            </div>

                                            <div className="field">
                                                <FloatInput
                                                    id="password"
                                                    type="password"
                                                    label="Contraseña (dejar vacío para no cambiar)"
                                                    value={form.password}
                                                    onChange={(e) =>
                                                        setForm({ ...form, password: e.target.value })
                                                    }
                                                    autoComplete="new-password"
                                                    disabled={saving}
                                                />
                                            </div>

                                            <div className="field">
                                                <FloatInput
                                                    id="institution"
                                                    label="Hospital/Institución"
                                                    value={form.institution}
                                                    onChange={(e) =>
                                                        setForm({ ...form, institution: e.target.value })
                                                    }
                                                    autoComplete="organization"
                                                    disabled={saving}
                                                />
                                            </div>
                                        </div>

                                        <div className="profile__editActions">
                                            <Button
                                                variant="muted"
                                                tone="blue"
                                                onClick={handleSave}
                                                disabled={saving}
                                            >
                                                {saving ? "Guardando..." : "Guardar cambios"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                tone="pink"
                                                onClick={handleCancel}
                                                disabled={saving}
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

