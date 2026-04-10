export function getElement(id) {
    return document.getElementById(id);
}

export function getTrimmedValue(id) {
    return getElement(id)?.value?.trim() || '';
}

export function getNullableValue(id) {
    return getTrimmedValue(id) || null;
}

export function getNumberValue(id) {
    const rawValue = getElement(id)?.value;
    return rawValue !== '' && rawValue != null ? Number(rawValue) : null;
}

export function isToggleActive(id) {
    return getElement(id)?.classList.contains('active') || false;
}

export function isCheckboxItemChecked(key) {
    return document.querySelector(`.checkbox-item[data-key="${key}"]`)?.classList.contains('checked') || false;
}

export function getCheckboxGroupValues(containerId) {
    const selectedOptions = {};
    document.querySelectorAll(`#${containerId} .checkbox-item`).forEach((item) => {
        selectedOptions[item.dataset.key] = item.classList.contains('checked');
    });
    return selectedOptions;
}

export function moveNodeToHost(nodeId, hostId) {
    const node = getElement(nodeId);
    const host = getElement(hostId);

    if (node && host && node.parentElement !== host) {
        host.appendChild(node);
    }
}

