import { WEBHOOK_URL } from './config.js';
import { buildPayload } from './payload.js';
import { showSuccess } from './ui.js';
import { validateForm } from './validation.js';

export async function submitForm() {
    if (!validateForm()) return;

    const button = document.getElementById('btnSubmit');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Enviando...';

    const payload = buildPayload();

    if (!WEBHOOK_URL) {
        console.log('Event Request Payload:', payload);
        button.disabled = false;
        button.innerHTML = originalHtml;
        showSuccess(payload);
        return;
    }

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Error ${response.status}`);
        showSuccess(payload);
    } catch (error) {
        alert(`Error al enviar la solicitud: ${error.message}\nLos datos no se perdieron, intenta de nuevo.`);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}
