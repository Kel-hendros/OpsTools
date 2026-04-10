import { DEFAULT_EVENT_TYPE } from './config.js';
import { getElement, moveNodeToHost } from './dom.js';
import { CONDITIONAL_SECTION_IDS, EVENT_TYPE_CONFIG } from './form-schema.js';
import { setSelectedType } from './state.js';
import { clearErrors } from './validation.js';

export function showForm() {
    getElement('dashboardView').classList.add('hidden');
    getElement('formView').classList.remove('hidden');
    getElement('submitBar').classList.remove('hidden');
    window.scrollTo(0, 0);
}

export function showDashboard() {
    getElement('formView').classList.add('hidden');
    getElement('submitBar').classList.add('hidden');
    getElement('dashboardView').classList.remove('hidden');
    window.scrollTo(0, 0);
}

export function resetAndGoHome() {
    getElement('successOverlay').classList.add('hidden');
    getElement('eventForm').reset();
    getElement('successSummary').textContent = '';
    document.querySelectorAll('.checkbox-item').forEach((item) => item.classList.remove('checked'));
    document.querySelectorAll('.toggle-switch').forEach((toggleElement) => toggleElement.classList.remove('active'));
    hideConditionalSections();
    selectType(DEFAULT_EVENT_TYPE);
    clearErrors();
    showDashboard();
}

export function selectType(type) {
    const typeConfig = EVENT_TYPE_CONFIG[type];
    setSelectedType(type);
    document.querySelectorAll('.type-option').forEach((option) => {
        option.classList.toggle('selected', option.dataset.type === type);
    });
    getElement('typeError').textContent = '';
    typeConfig.visibleSections.forEach((sectionId) => toggle(sectionId, true));
    typeConfig.hiddenSections.forEach((sectionId) => toggle(sectionId, false));
    placeSharedFields(typeConfig.sharedHosts);
}

export function hideConditionalSections() {
    CONDITIONAL_SECTION_IDS.forEach((id) => toggle(id, false));
}

export function toggle(id, show) {
    const element = getElement(id);
    if (element) element.classList.toggle('hidden-section', !show);
}

export function toggleSwitch(toggleElement) {
    toggleElement.classList.toggle('active');
    if (toggleElement.id === 'toggleBines') {
        toggle('secBines', toggleElement.classList.contains('active'));
    }
}

export function showSuccess(payload) {
    const name = payload.nombre_evento || 'Evento';
    const type = payload.tipo_evento || '';
    getElement('successMsg').textContent = `La solicitud "${name}" (${type}) fue recibida correctamente. OPS la procesara a la brevedad.`;
    getElement('successSummary').textContent = payload.ops_summary || '';
    getElement('successOverlay').classList.remove('hidden');
}

function placeSharedFields(sharedHosts) {
    moveNodeToHost('sharedStadiumField', sharedHosts.stadium);
    moveNodeToHost('sharedGeneralFields', sharedHosts.general);
}
