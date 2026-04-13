Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = 'rgba(15,23,42,0.1)';
Chart.defaults.plugins.legend.labels.color = '#64748b';

let DATA = [];
let currentCountry = 'MEX';

const COUNTRIES = {
    MEX: { code: 'MEX', name: 'México', flag: '🇲🇽', locale: 'es-MX' },
    COL: { code: 'COL', name: 'Colombia', flag: '🇨🇴', locale: 'es-CO' },
};

const API_BASE = 'https://fanki.com.mx/api/events/categorized?country=';

// Parse local date/time directly from ISO string without timezone conversion
// "2026-04-14T21:30:00-06:00" → { year:2026, month:4, day:14, hour:21, minute:30 }
function parseLocalDate(isoStr) {
    if (!isoStr) return null;
    const m = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
}

const MONTH_NAMES_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTH_FULL_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatLocalDate(ld) {
    if (!ld) return '-';
    return String(ld.day).padStart(2,'0') + ' ' + MONTH_NAMES_ES[ld.month - 1] + ' ' + ld.year + ' ' + String(ld.hour).padStart(2,'0') + ':' + String(ld.minute).padStart(2,'0');
}

function localDateKey(ld) {
    if (!ld) return '';
    return ld.year + '-' + String(ld.month).padStart(2,'0') + '-' + String(ld.day).padStart(2,'0');
}

function flattenApiResponse(categories) {
    const events = [];
    for (const cat of categories) {
        for (const e of (cat.events || [])) {
            events.push({
                id: e.id,
                code: e.code,
                name: e.name,
                type: e.type,
                category: cat.name,
                catCode: cat.code,
                dateUtc: e.dateUtc,
                date: e.date,
                localDate: parseLocalDate(e.date) || parseLocalDate(e.dateUtc),
                soldOut: e.soldOut,
                showInCatalog: e.showInCatalog,
                featured: e.featured,
                homeTeam: e.homeTeam ? e.homeTeam.name : null,
                homeTeamImg: e.homeTeam ? e.homeTeam.image : null,
                awayTeam: e.awayTeam ? (typeof e.awayTeam === 'string' ? e.awayTeam : e.awayTeam.name) : null,
                awayTeamImg: e.awayTeam && typeof e.awayTeam === 'object' ? e.awayTeam.image : null,
                venue: e.venue ? e.venue.name : '',
                city: e.venue ? (e.venue.city || e.venue.state || '') : '',
                state: e.venue ? (e.venue.state || '') : '',
                capacity: e.venue ? (e.venue.capacity || 0) : 0,
                enableQueue: e.enableQueue || false,
            });
        }
    }
    return events;
}

async function fetchEvents(countryCode) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = 'flex';
    try {
        const resp = await fetch(API_BASE + countryCode);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const categories = await resp.json();
        DATA = flattenApiResponse(categories);
    } catch (err) {
        console.error('Error cargando eventos:', err);
        DATA = [];
    } finally {
        overlay.style.display = 'none';
    }
}

async function switchCountry(code) {
    currentCountry = code;
    const country = COUNTRIES[code];
    // Reset filters
    selectedTeams.clear();
    // Fetch new data
    await fetchEvents(code);
    // Update footer
    document.querySelector('.footer').innerHTML = 'Generado el ' + new Date().toLocaleDateString(country.locale) + ' &middot; Fuente: fanki.com.mx/api/events/categorized?country=' + code;
    // Re-init chips, filters, charts
    init();
}

const COLORS = ['#6C3CE1','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#FF8C42','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9','#F1948A','#82E0AA'];

let selectedTeams = new Set();

function init() {
    // Populate team chips
    const teams = [...new Set(DATA.map(e => e.homeTeam).filter(Boolean))].sort();
    const teamCounts = {};
    DATA.forEach(e => { if (e.homeTeam) teamCounts[e.homeTeam] = (teamCounts[e.homeTeam]||0) + 1; });
    // Find team images
    const teamImages = {};
    DATA.forEach(e => { if (e.homeTeam && e.homeTeamImg && !teamImages[e.homeTeam]) teamImages[e.homeTeam] = e.homeTeamImg; });

    const chipsContainer = document.getElementById('teamChips');
    chipsContainer.innerHTML = teams.map(t => {
        const img = teamImages[t] ? '<img class="chip-img" src="' + teamImages[t] + '" onerror="this.style.display=\'none\'">' : '';
        return '<button class="chip" data-team="' + t + '" onclick="toggleTeam(this)">' + img + '<span>' + t + '</span><span class="chip-count">' + teamCounts[t] + '</span></button>';
    }).join('') + '<button class="chip-clear" id="clearTeams" onclick="clearTeams()" style="display:none">✕ Limpiar filtro</button>';

    applyFilters();
}

function toggleTeam(el) {
    const team = el.dataset.team;
    if (selectedTeams.has(team)) {
        selectedTeams.delete(team);
        el.classList.remove('active');
    } else {
        selectedTeams.add(team);
        el.classList.add('active');
    }
    document.getElementById('clearTeams').style.display = selectedTeams.size > 0 ? '' : 'none';
    applyFilters();
}

function clearTeams() {
    selectedTeams.clear();
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    document.getElementById('clearTeams').style.display = 'none';
    applyFilters();
}

function getFiltered() {
    return DATA.filter(e => {
        if (selectedTeams.size > 0 && !selectedTeams.has(e.homeTeam)) return false;
        return true;
    });
}

function applyFilters() {
    const filtered = getFiltered();
    updateKPIs(filtered);
    updateCharts(filtered);
    updateTable(filtered);
    updateCalendar(filtered);
}

function updateKPIs(data) {
    document.getElementById('kpiTotal').textContent = data.length;
    const catalog = data.filter(e => e.showInCatalog).length;
    document.getElementById('kpiCatalog').textContent = catalog;
    document.getElementById('kpiCatalogDetail').textContent = Math.round(catalog/Math.max(data.length,1)*100) + '% del total';
    const soldOut = data.filter(e => e.soldOut).length;
    document.getElementById('kpiSoldOut').textContent = soldOut;
    document.getElementById('kpiSoldOutDetail').textContent = soldOut > 0 ? Math.round(soldOut/Math.max(data.length,1)*100) + '% del total' : 'Ninguno agotado';
    const teams = new Set(data.map(e => e.homeTeam).filter(Boolean));
    document.getElementById('kpiTeams').textContent = teams.size;

    // Next event
    const now = new Date();
    const upcoming = data.filter(e => new Date(e.dateUtc) > now).sort((a,b) => new Date(a.dateUtc) - new Date(b.dateUtc));
    if (upcoming.length > 0) {
        const next = upcoming[0];
        const ld = next.localDate;
        document.getElementById('kpiNext').textContent = ld ? ld.day + ' ' + MONTH_NAMES_ES[ld.month - 1] : '-';
        document.getElementById('kpiNextDetail').textContent = next.name;
    } else {
        document.getElementById('kpiNext').textContent = '-';
        document.getElementById('kpiNextDetail').textContent = 'Sin próximos eventos';
    }
}

let chartTeams, chartTimeline;

function updateCharts(data) {
    // Events by home team
    const teamCounts = {};
    data.forEach(e => { if(e.homeTeam) teamCounts[e.homeTeam] = (teamCounts[e.homeTeam]||0)+1; });
    const teamLabels = Object.keys(teamCounts).sort((a,b) => teamCounts[b]-teamCounts[a]);
    const teamValues = teamLabels.map(t => teamCounts[t]);

    if (chartTeams) chartTeams.destroy();
    chartTeams = new Chart(document.getElementById('chartTeams'), {
        type: 'bar',
        data: { labels: teamLabels, datasets: [{ label: 'Eventos', data: teamValues, backgroundColor: COLORS.slice(0, teamLabels.length), borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // Timeline by month
    const monthCounts = {};
    data.forEach(e => {
        const ld = e.localDate;
        if (!ld) return;
        const key = ld.year + '-' + String(ld.month).padStart(2,'0');
        monthCounts[key] = (monthCounts[key]||0)+1;
    });
    const monthLabels = Object.keys(monthCounts).sort();
    const monthNames = monthLabels.map(m => { const [y,mo] = m.split('-'); return MONTH_NAMES_ES[+mo - 1] + ' ' + y; });
    const monthValues = monthLabels.map(m => monthCounts[m]);

    if (chartTimeline) chartTimeline.destroy();
    chartTimeline = new Chart(document.getElementById('chartTimeline'), {
        type: 'bar',
        data: { labels: monthNames, datasets: [{ label: 'Eventos', data: monthValues, backgroundColor: '#6C3CE1', borderRadius: 6 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

}

function updateTable(data) {
    // Sort chronologically
    const sorted = [...data].sort((a, b) => new Date(a.dateUtc) - new Date(b.dateUtc));

    document.getElementById('tableCount').textContent = sorted.length;

    // Group by local date
    const groups = [];
    const groupMap = {};
    sorted.forEach(e => {
        const key = localDateKey(e.localDate);
        if (!key) return;
        if (!groupMap[key]) {
            groupMap[key] = { key, events: [] };
            groups.push(groupMap[key]);
        }
        groupMap[key].events.push(e);
    });

    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    const container = document.getElementById('eventsList');
    container.innerHTML = groups.map(g => {
        const [y, m, d] = g.key.split('-').map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        const dayName = DAY_NAMES_ES[dow];
        const monthName = MONTH_FULL_ES[m - 1];
        const isToday = g.key === todayStr;
        const headerLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' ' + d + ' de ' + monthName + ' ' + y;

        let html = '<div class="day-group">';
        html += '<div class="day-group-header' + (isToday ? ' is-today' : '') + '">' +
            '<span class="day-label">' + headerLabel + (isToday ? ' — Hoy' : '') + '</span>' +
            '<span class="day-count">' + g.events.length + '</span>' +
        '</div>';
        html += '<div class="day-group-events">';

        html += g.events.map(e => {
            const ld = e.localDate;
            const time = ld ? String(ld.hour).padStart(2,'0') + ':' + String(ld.minute).padStart(2,'0') : '--:--';

            let badges = '';
            if (e.enableQueue) badges += '<span class="badge badge-queue">Cola</span>';
            if (e.soldOut) badges += '<span class="badge badge-soldout">Agotado</span>';
            else badges += '<span class="badge badge-available">Disponible</span>';
            if (e.showInCatalog) badges += '<span class="badge badge-catalog">Catálogo</span>';
            if (isToday) badges += '<span class="badge badge-today">Hoy</span>';

            const lineClass = e.soldOut ? 'line-soldout' : (e.enableQueue ? 'line-queue' : 'line-available');
            const htImg = e.homeTeamImg ? '<img src="' + e.homeTeamImg + '" onerror="this.style.display=\'none\'">' : '';

            const teamsHtml = e.homeTeam
                ? (e.awayTeam
                    ? '<span class="team-home">' + e.homeTeam + '</span> <span class="vs">vs</span> <span class="team-away">' + e.awayTeam + '</span>'
                    : '<span class="team-home">' + e.homeTeam + '</span>')
                : '-';

            return '<div class="ev-row' + (isToday ? ' ev-row-today' : '') + '">' +
                '<div class="ev-time">' + time + '</div>' +
                '<div class="ev-accent-line ' + lineClass + '"></div>' +
                '<div class="ev-team-logo">' + htImg + '</div>' +
                '<div class="ev-main"><div class="ev-name">' + e.name + '</div><div class="ev-code">' + (e.code || '') + '</div></div>' +
                '<div class="ev-teams">' + teamsHtml + '</div>' +
                '<div class="ev-venue">' + (e.venue || '-') + '</div>' +
                '<div class="ev-badges">' + badges + '</div>' +
            '</div>';
        }).join('');

        html += '</div></div>';
        return html;
    }).join('');
}

// === CALENDAR VIEW ===
let currentView = 'table';
let calYear, calMonth; // 0-indexed month

function initCalendarDate() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
}
initCalendarDate();

function switchView(view) {
    currentView = view;
    document.querySelectorAll('#viewToggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('tableSection').classList.toggle('hidden', view === 'calendar');
    document.getElementById('calendarSection').classList.toggle('active', view === 'calendar');
    if (view === 'calendar') updateCalendar(getFiltered());
}

function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } updateCalendar(getFiltered()); }
function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } updateCalendar(getFiltered()); }
function calToday() { const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth(); updateCalendar(getFiltered()); }

function updateCalendar(data) {
    if (currentView !== 'calendar') return;

    const locale = COUNTRIES[currentCountry]?.locale || 'es-MX';
    const monthName = new Date(calYear, calMonth).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    document.getElementById('calMonthLabel').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Group events by local day key (YYYY-MM-DD)
    const eventsByDay = {};
    data.forEach(e => {
        const key = localDateKey(e.localDate);
        if (!key) return;
        if (!eventsByDay[key]) eventsByDay[key] = [];
        eventsByDay[key].push(e);
    });

    // Count events visible in this month
    let monthEventCount = 0;

    // Build calendar grid
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    let startDow = firstDay.getDay(); // 0=Sun
    // Adjust to Monday start: Mon=0, Sun=6
    startDow = (startDow + 6) % 7;

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let html = dayNames.map(d => '<div class="cal-day-header">' + d + '</div>').join('');

    // Store eventsByDay for modal access
    window._calEventsByDay = eventsByDay;

    // Previous month fill
    const prevLastDay = new Date(calYear, calMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
        const dayNum = prevLastDay - i;
        html += '<div class="cal-day other-month"><span class="cal-day-num">' + dayNum + '</span></div>';
    }

    // Current month days
    const MAX_VISIBLE = 3;
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const key = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        const isToday = key === todayStr;
        const dayEvents = eventsByDay[key] || [];
        monthEventCount += dayEvents.length;

        const clickable = dayEvents.length > 0 ? ' style="cursor:pointer" onclick="openDayModal(\'' + key + '\')"' : '';
        html += '<div class="cal-day' + (isToday ? ' is-today' : '') + '"' + clickable + '>';
        html += '<span class="cal-day-num">' + day + '</span>';
        html += '<div class="cal-events">';
        const visible = dayEvents.slice(0, MAX_VISIBLE);
        visible.forEach(e => {
            const cls = e.soldOut ? 'ev-soldout' : 'ev-available';
            const ld = e.localDate;
            const timeStr = ld ? '<span class="cal-event-time">' + String(ld.hour).padStart(2,'0') + ':' + String(ld.minute).padStart(2,'0') + '</span>' : '';
            html += '<div class="cal-event ' + cls + '" title="' + e.name + ' — ' + (e.venue || '') + '">' + timeStr + e.name + '</div>';
        });
        if (dayEvents.length > MAX_VISIBLE) {
            html += '<div class="cal-event-more">+' + (dayEvents.length - MAX_VISIBLE) + ' más</div>';
        }
        html += '</div></div>';
    }

    // Next month fill
    const totalCells = startDow + lastDay.getDate();
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        html += '<div class="cal-day other-month"><span class="cal-day-num">' + i + '</span></div>';
    }

    document.getElementById('calGrid').innerHTML = html;
    document.getElementById('calEventCount').textContent = monthEventCount;
}

// === DAY MODAL ===
const DAY_NAMES_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function openDayModal(dateKey) {
    const events = (window._calEventsByDay || {})[dateKey] || [];
    const [y, m, d] = dateKey.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const dayName = DAY_NAMES_ES[dow];
    const monthName = MONTH_FULL_ES[m - 1];

    document.getElementById('dayModalTitle').textContent = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' ' + d + ' de ' + monthName;
    document.getElementById('dayModalSub').textContent = events.length + ' evento' + (events.length !== 1 ? 's' : '');

    const body = document.getElementById('dayModalBody');
    if (events.length === 0) {
        body.innerHTML = '<div class="day-modal-empty">No hay eventos este día</div>';
    } else {
        // Sort by time
        const sorted = [...events].sort((a, b) => {
            const la = a.localDate, lb = b.localDate;
            if (!la || !lb) return 0;
            return (la.hour * 60 + la.minute) - (lb.hour * 60 + lb.minute);
        });

        body.innerHTML = sorted.map(e => {
            const ld = e.localDate;
            const hour = ld ? String(ld.hour).padStart(2, '0') : '--';
            const min = ld ? String(ld.minute).padStart(2, '0') : '--';
            const lineClass = e.soldOut ? 'line-soldout' : 'line-available';
            const htImg = e.homeTeamImg ? '<img src="' + e.homeTeamImg + '" onerror="this.style.display=\'none\'">' : '';
            const atImg = e.awayTeamImg ? '<img src="' + e.awayTeamImg + '" onerror="this.style.display=\'none\'" style="width:18px;height:18px;border-radius:50%;object-fit:contain">' : '';

            let badges = '';
            if (e.enableQueue) badges += '<span class="badge badge-queue">Cola</span>';
            if (e.soldOut) badges += '<span class="badge badge-soldout">Agotado</span>';
            else badges += '<span class="badge badge-available">Disponible</span>';
            if (e.showInCatalog) badges += '<span class="badge badge-catalog">Catálogo</span>';

            return '<div class="day-event-item">' +
                '<div class="day-event-time"><div class="de-hour">' + hour + ':' + min + '</div></div>' +
                '<div class="day-event-line ' + lineClass + '"></div>' +
                '<div class="day-event-info">' +
                    '<div class="day-event-name">' + htImg + e.name + '</div>' +
                    '<div class="day-event-meta">' +
                        (e.venue ? '<span>' + e.venue + '</span>' : '') +
                        (e.category ? '<span>&middot; ' + e.category + '</span>' : '') +
                        badges +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    document.getElementById('dayModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDayModal() {
    document.getElementById('dayModal').classList.remove('open');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDayModal(); });

// Fix footer date
document.addEventListener('DOMContentLoaded', async () => {
    await fetchEvents(currentCountry);
    const country = COUNTRIES[currentCountry];
    document.querySelector('.footer').innerHTML = 'Generado el ' + new Date().toLocaleDateString(country.locale) + ' &middot; Fuente: fanki.com.mx/api/events/categorized?country=' + currentCountry;
    init();
});
