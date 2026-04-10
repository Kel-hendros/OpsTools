import { getCheckboxGroupValues, getNullableValue, getNumberValue, isToggleActive } from './dom.js';
import { PAYLOAD_FIELDS } from './form-schema.js';
import { getSelectedType } from './state.js';
import { buildOpsSummary } from './summary.js';

export function buildPayload() {
    const selectedType = getSelectedType();
    const context = {
        selectedType,
        toggles: {
            toggleBines: isToggleActive('toggleBines'),
        },
    };

    const payload = PAYLOAD_FIELDS.reduce((result, definition) => {
        result[definition.key] = resolvePayloadValue(definition, context);
        return result;
    }, {});

    payload.ops_summary = buildOpsSummary(payload);

    return payload;
}

function resolvePayloadValue(definition, context) {
    if (definition.value) {
        return definition.value(context);
    }

    if (definition.onlyFor && definition.onlyFor !== context.selectedType) {
        return null;
    }

    const fieldId = definition.byType?.[context.selectedType] || definition.field;
    if (!fieldId) {
        return null;
    }

    if (definition.whenToggle && !context.toggles[definition.whenToggle]) {
        return null;
    }

    switch (definition.transform) {
    case 'number':
        return getNumberValue(fieldId);
    case 'checkboxGroup':
        return getCheckboxGroupValues(fieldId);
    case 'toggle':
        return isToggleActive(fieldId);
    default:
        return getNullableValue(fieldId);
    }
}
