import { DEFAULT_EVENT_TYPE } from './config.js';

let selectedType = DEFAULT_EVENT_TYPE;

export function getSelectedType() {
    return selectedType;
}

export function setSelectedType(type) {
    selectedType = type;
}

