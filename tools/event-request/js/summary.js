const PAYMENT_METHOD_LABELS = {
    mp_cash: 'Mercado Pago: Cash',
    mp_tarjetas: 'Mercado Pago: Tarjeta',
    mp_transferencia: 'Mercado Pago: Transferencia',
    adyen_tarjeta: 'Adyen: Tarjeta',
    banorte_tarjeta: 'Banorte: Tarjeta',
    tarjeta_fanki: 'Fanki: Tarjeta Fanki',
    fanki_cash: 'Fanki: Fanki Cash',
    paguitos: 'Paguitos: Cuotas sin tarjeta',
    link_mercado: 'Mercado Pago: Link de Pago',
    link_banorte: 'Banorte: Link de Pago',
    link_adyen: 'Adyen: Link de Pago',
};

export function buildOpsSummary(payload) {
    const lines = [
        `# ${buildTitle(payload)}`,
        '',
        '## Tareas OPS',
        formatTask(`${payload.tipo_evento === 'ABONO' ? 'Crear abono' : 'Crear evento'} "${payload.nombre_evento}"`),
        formatTask(`Vincular la solicitud con el organizador "${payload.organizador}"`),
        formatTask('Configurar medios de pago y reglas comerciales segun el detalle adjunto'),
        '',
        '## Datos base',
        formatBulletLabel('Tipo', payload.tipo_evento),
        formatBulletLabel('Nombre', payload.nombre_evento),
        formatBulletLabel('Organizador', payload.organizador),
        formatBulletLabel('ODE', payload.ode),
        formatBulletLabel('Cargado por', payload.cargado_por),
        formatBulletLabel('Codigo', payload.codigo_evento || 'Generar desde OPS'),
        formatBulletLabel('Pais', payload.Country),
        formatBulletLabel('Estadio', payload.estadio),
    ];

    appendTypeSpecificLines(lines, payload);
    appendGeneralConfigLines(lines, payload);
    appendPaymentLines(lines, 'Medios de pago - Fans', payload.medios_pago_fans);
    appendPaymentLines(lines, 'Medios de pago - Asesores', payload.medios_pago_asesores);
    appendCommercialRules(lines, payload);
    appendAdditionalNotes(lines, payload);

    return compactLines(lines).join('\n');
}

function buildTitle(payload) {
    const action = payload.tipo_evento === 'ABONO' ? 'Crear abono' : 'Crear partido';
    return `${action}: ${payload.nombre_evento}`;
}

function appendTypeSpecificLines(lines, payload) {
    lines.push('', `## ${payload.tipo_evento === 'ABONO' ? 'Datos del abono' : 'Datos del partido'}`);

    if (payload.tipo_evento === 'PARTIDO') {
        lines.push(formatBulletLabel('Rival', payload.rival));
        lines.push(formatBulletLabel('Fecha del evento', formatDate(payload.fecha_hora_evento)));
        return;
    }

    lines.push(formatBulletLabel('Cantidad de eventos', payload.cantidad_eventos_abono || 'Pendiente'));
    lines.push(formatBulletLabel('Codigos incluidos', payload.codigos_eventos_abono || 'Pendiente'));
    lines.push(formatBulletLabel('Fecha de apagado', formatDateTime(payload.fecha_apagado_abono)));
}

function appendGeneralConfigLines(lines, payload) {
    lines.push('', '## Configuracion general');
    lines.push(formatBulletLabel('Fecha de encendido', formatDate(payload.fecha_publicacion)));
    lines.push(formatBulletLabel('Modo de encendido inicial', payload.modo_encendido));
    lines.push(formatBulletLabel('Maximo de boletos por usuario', payload.max_boletos_por_usuario));
    lines.push(formatBulletLabel('Dias de espera para cash', payload.cash_payment_due_days));
    lines.push(formatBulletLabel('QR', payload.qr_type));
    lines.push(formatBulletLabel('Lectura Fanki Business', payload.connection_mode));
}

function appendPaymentLines(lines, title, paymentMethods) {
    lines.push('', `## ${title}`);

    const enabledMethods = Object.entries(paymentMethods || {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => PAYMENT_METHOD_LABELS[key] || key);

    if (!enabledMethods.length) {
        lines.push(formatTask('Sin medios habilitados'));
        return;
    }

    enabledMethods.forEach((label) => {
        lines.push(formatTask(label));
    });
}

function appendCommercialRules(lines, payload) {
    lines.push('', '## Reglas comerciales');
    lines.push(formatBulletLabel('Exclusividad por BINes', payload.exclusividad_bines ? 'Si' : 'No'));

    if (payload.exclusividad_bines) {
        lines.push(formatBulletLabel('BINes habilitados', payload.listado_bines));
    }

    if (payload.medios_pago_fans?.paguitos) {
        lines.push(formatBulletLabel('Cuotas Paguitos', payload.cuotas_cantidad));
        lines.push(formatBulletLabel('Interes Paguitos', `${payload.cuotas_interes}%`));
    }
}

function appendAdditionalNotes(lines, payload) {
    if (!payload.pedidos_adicionales) return;

    lines.push('', '## Pedidos adicionales');
    lines.push(payload.pedidos_adicionales);
}

function formatBullet(content) {
    return `- ${content}`;
}

function formatBulletLabel(label, value) {
    return formatBullet(`**${label}:** ${value || 'No informado'}`);
}

function formatTask(content) {
    return `- [ ] ${content}`;
}

function formatDateTime(value) {
    if (!value) return 'No informado';

    const [datePart, timePart] = value.split('T');
    if (!datePart) return value;

    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return value;

    const normalizedTime = timePart ? timePart.slice(0, 5) : '';
    return normalizedTime ? `${day}/${month}/${year} ${normalizedTime}` : `${day}/${month}/${year}`;
}

function formatDate(value) {
    return formatDateTime(value);
}

function compactLines(lines) {
    return lines.reduce((result, line) => {
        if (line == null) return result;
        if (line === '' && (!result.length || result[result.length - 1] === '')) return result;
        result.push(line);
        return result;
    }, []);
}
