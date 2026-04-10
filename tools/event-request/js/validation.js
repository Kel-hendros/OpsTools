import { getElement, getTrimmedValue, isCheckboxItemChecked, isToggleActive } from './dom.js';
import { CONDITIONAL_REQUIRED_RULES, REQUIRED_FIELDS, URL_VALIDATION_FIELDS } from './form-schema.js';
import { getSelectedType } from './state.js';

export function clearErrors() {
    document.querySelectorAll('.field-error').forEach((error) => {
        error.textContent = '';
    });
    document.querySelectorAll('.invalid').forEach((field) => {
        field.classList.remove('invalid');
    });
}

export function validateForm() {
    clearErrors();
    let valid = true;
    const selectedType = getSelectedType();

    if (!selectedType) {
        getElement('typeError').textContent = 'Selecciona un tipo de evento';
        valid = false;
    }

    valid = validateRequiredFields(REQUIRED_FIELDS.common) && valid;
    valid = validateRequiredFields(REQUIRED_FIELDS.byType[selectedType] || []) && valid;
    valid = validateConditionalRules() && valid;
    valid = validateUrlFields() && valid;

    if (!valid) {
        const firstInvalid = document.querySelector('.invalid, .field-error:not(:empty)');
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return valid;
}

export function validateField(fieldId) {
    clearFieldError(fieldId);

    const requiredField = getActiveRequiredFields().find((field) => field.id === fieldId);
    if (requiredField) {
        const requiredValue = getTrimmedValue(fieldId);
        if (!requiredValue) {
            setError(fieldId, `${requiredField.label} es obligatorio`);
            return false;
        }

        const fieldConstraintError = getFieldConstraintError(requiredField, requiredValue);
        if (fieldConstraintError) {
            setError(fieldId, fieldConstraintError);
            return false;
        }
    }

    const conditionalRule = getActiveConditionalFieldRule(fieldId);
    if (conditionalRule) {
        const conditionalValue = getTrimmedValue(fieldId);
        const isEmpty = conditionalRule.allowZero ? conditionalValue === '' : !conditionalValue;
        if (isEmpty) {
            setError(fieldId, conditionalRule.message);
            return false;
        }
    }

    const urlRule = URL_VALIDATION_FIELDS.find((field) => field.id === fieldId);
    if (urlRule) {
        const value = getTrimmedValue(fieldId);
        if (value && !isValidUrl(value)) {
            setError(fieldId, urlRule.message);
            return false;
        }
    }

    return true;
}

function setError(fieldId, message) {
    const errorElement = document.querySelector(`.field-error[data-for="${fieldId}"]`);
    if (errorElement) errorElement.textContent = message;

    const input = getElement(fieldId);
    if (input) input.classList.add('invalid');
}

function clearFieldError(fieldId) {
    const errorElement = document.querySelector(`.field-error[data-for="${fieldId}"]`);
    if (errorElement) errorElement.textContent = '';

    const input = getElement(fieldId);
    if (input) input.classList.remove('invalid');
}

function validateRequiredFields(fields) {
    let valid = true;

    fields.forEach((field) => {
        const value = getTrimmedValue(field.id);
        if (!value) {
            setError(field.id, `${field.label} es obligatorio`);
            valid = false;
            return;
        }

        const fieldConstraintError = getFieldConstraintError(field, value);
        if (fieldConstraintError) {
            setError(field.id, fieldConstraintError);
            valid = false;
        }
    });

    return valid;
}

function getActiveRequiredFields() {
    const selectedType = getSelectedType();
    return [
        ...REQUIRED_FIELDS.common,
        ...(REQUIRED_FIELDS.byType[selectedType] || []),
    ];
}

function validateConditionalRules() {
    let valid = true;

    CONDITIONAL_REQUIRED_RULES.forEach((rule) => {
        if (!matchesCondition(rule.when)) return;

        rule.fields.forEach((field) => {
            const value = getTrimmedValue(field.id);
            const isEmpty = field.allowZero ? value === '' : !value;

            if (isEmpty) {
                setError(field.id, field.message);
                valid = false;
            }
        });
    });

    return valid;
}

function getActiveConditionalFieldRule(fieldId) {
    for (const rule of CONDITIONAL_REQUIRED_RULES) {
        if (!matchesCondition(rule.when)) continue;

        const fieldRule = rule.fields.find((field) => field.id === fieldId);
        if (fieldRule) return fieldRule;
    }

    return null;
}

function validateUrlFields() {
    let valid = true;

    URL_VALIDATION_FIELDS.forEach((field) => {
        const value = getTrimmedValue(field.id);
        if (value && !isValidUrl(value)) {
            setError(field.id, field.message);
            valid = false;
        }
    });

    return valid;
}

function getFieldConstraintError(field, value) {
    if (field.minValue != null && Number(value) < field.minValue) {
        return field.minMessage || `${field.label} debe ser al menos ${field.minValue}`;
    }

    if (field.exactLength != null && value.length !== field.exactLength) {
        return field.exactLengthMessage || `${field.label} debe tener exactamente ${field.exactLength} caracteres`;
    }

    return null;
}

function matchesCondition(condition) {
    if (condition.checkbox) return isCheckboxItemChecked(condition.checkbox);
    if (condition.toggle) return isToggleActive(condition.toggle);
    return false;
}

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
