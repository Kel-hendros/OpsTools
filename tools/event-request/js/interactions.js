import { resetAndGoHome, selectType, showDashboard, showForm, toggle, toggleSwitch } from './ui.js';
import { submitForm } from './submit.js';
import { validateField } from './validation.js';

export function initializeActions() {
    document.querySelector('.btn-create')?.addEventListener('click', showForm);
    document.querySelector('.btn-back-dash')?.addEventListener('click', showDashboard);
    document.querySelector('.btn-cancel')?.addEventListener('click', showDashboard);
    document.querySelector('.btn-new')?.addEventListener('click', resetAndGoHome);
    document.getElementById('btnSubmit')?.addEventListener('click', submitForm);
    document.getElementById('toggleBines')?.addEventListener('click', (event) => {
        toggleSwitch(event.currentTarget);
    });
    document.querySelectorAll('.type-option').forEach((option) => {
        option.addEventListener('click', () => {
            selectType(option.dataset.type);
        });
    });
    document.getElementById('eventForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitForm();
    });
}

export function initializeCheckboxes() {
    document.querySelectorAll('.checkbox-item').forEach((item) => {
        item.addEventListener('click', () => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            item.classList.toggle('checked', checkbox.checked);
            if (item.dataset.key === 'paguitos') toggle('secCuotas', checkbox.checked);
        });
    });
}

export function initializeAbonoCodeCounter() {
    const codigosAbono = document.getElementById('codigosEventosAbono');
    if (!codigosAbono) return;

    codigosAbono.addEventListener('input', () => {
        const value = codigosAbono.value.trim();
        const countElement = document.getElementById('cantidadEventosAbono');
        if (!value || value.toLowerCase() === 'pendiente') {
            countElement.value = '';
            return;
        }

        countElement.value = value
            .split(',')
            .map((code) => code.trim())
            .filter((code) => code.length > 0)
            .length;
    });
}

export function initializeRealtimeValidation() {
    const cashPaymentDueDays = document.getElementById('cashPaymentDueDays');
    cashPaymentDueDays?.addEventListener('input', () => {
        validateField('cashPaymentDueDays');
    });

    const ode = document.getElementById('ode');
    ode?.addEventListener('input', () => {
        ode.value = ode.value.toUpperCase().slice(0, 3);
        validateField('ode');
    });
}
