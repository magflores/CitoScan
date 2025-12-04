import React from "react";
import "./Modal.css";

export default function Modal({ open, onClose, children }) {
    if (!open) return null;

    return (
        <div className="modal__backdrop" role="dialog" aria-modal="true">
            <div className="modal__card">
                <button
                    type="button"
                    className="modal__close"
                    aria-label="Cerrar"
                    onClick={onClose}
                >
                    ×
                </button>
                <div className="modal__body">{children}</div>
            </div>
        </div>
    );
}
