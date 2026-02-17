/**
 * Ops Tools — Dashboard
 *
 * Para agregar una nueva herramienta, agregar un objeto al array TOOLS.
 * El dashboard se genera automaticamente.
 */

const TOOLS = [
    {
        id: 'grid-manager',
        name: 'G.R.I.D.O.',
        subtitle: 'Stadium Grid Manager',
        description: 'Diseñá y exportá grillas de asientos para estadios con canvas infinito, pintado drag, y exportación a CSV/ZIP.',
        icon: '🏟️',
        path: 'tools/grid-manager/index.html',
        accentColor: '#3b82f6',
    },
    {
        id: 'acreditation-manager',
        name: 'Acreditaciones Fanki',
        subtitle: 'Credential Manager',
        description: 'Generá y gestioná acreditaciones con códigos QR/barcode, grupos, subgrupos y exportación a Excel.',
        icon: '🎫',
        path: 'tools/acreditation-manager/index.html',
        accentColor: '#2563eb',
    },
];

function renderTools() {
    const grid = document.getElementById('tools-grid');
    grid.innerHTML = TOOLS.map(tool => `
        <a href="${tool.path}" class="tool-card" style="--card-accent: ${tool.accentColor}">
            <div class="tool-card-icon">${tool.icon}</div>
            <div class="tool-card-body">
                <h2 class="tool-card-name">${tool.name}</h2>
                <p class="tool-card-subtitle">${tool.subtitle}</p>
                <p class="tool-card-desc">${tool.description}</p>
            </div>
            <div class="tool-card-arrow">→</div>
        </a>
    `).join('');
}

document.addEventListener('DOMContentLoaded', renderTools);
