export const EVENT_TYPE_CONFIG = {
    PARTIDO: {
        visibleSections: ['secPartido'],
        hiddenSections: ['secAbono'],
        sharedHosts: {
            stadium: 'stadiumHostPartido',
            general: 'generalFieldsHostPartido',
        },
    },
    ABONO: {
        visibleSections: ['secAbono'],
        hiddenSections: ['secPartido'],
        sharedHosts: {
            stadium: 'stadiumHostAbono',
            general: 'generalFieldsHostAbono',
        },
    },
};

export const CONDITIONAL_SECTION_IDS = [
    ...new Set(
        Object.values(EVENT_TYPE_CONFIG).flatMap((config) => [
            ...config.visibleSections,
            ...config.hiddenSections,
        ]),
    ),
    'secCuotas',
    'secBines',
];

export const REQUIRED_FIELDS = {
    common: [
        { id: 'cargadoPor', label: 'Cargado por' },
        { id: 'nombreEvento', label: 'Nombre del Evento' },
        { id: 'organizador', label: 'Organizador' },
        { id: 'ode', label: 'ODE', exactLength: 3, exactLengthMessage: 'ODE debe tener exactamente 3 caracteres' },
        { id: 'fechaPublicacion', label: 'Fecha de Encendido' },
        { id: 'modoEncendido', label: 'Modo de Encendido' },
        { id: 'estadio', label: 'Estadio' },
        { id: 'maxBoletos', label: 'Max. Boletos' },
        { id: 'cashPaymentDueDays', label: 'Dias espera cash', minValue: 2, minMessage: 'Dias de espera para pagos en efectivo debe ser al menos 2' },
        { id: 'qrType', label: 'Tipo de QR' },
        { id: 'connectionMode', label: 'Tipo de lectura' },
    ],
    byType: {
        PARTIDO: [
            { id: 'countryPartido', label: 'Pais' },
            { id: 'rival', label: 'Rival' },
            { id: 'fechaHoraEvento', label: 'Fecha del evento' },
        ],
        ABONO: [
            { id: 'countryAbono', label: 'Pais' },
            { id: 'fechaApagadoAbono', label: 'Fecha de apagado' },
        ],
    },
};

export const CONDITIONAL_REQUIRED_RULES = [
    {
        when: { checkbox: 'paguitos' },
        fields: [
            { id: 'cuotasCantidad', message: 'Cantidad de cuotas es obligatoria' },
            { id: 'cuotasInteres', message: 'Interes es obligatorio', allowZero: true },
        ],
    },
    {
        when: { toggle: 'toggleBines' },
        fields: [
            { id: 'listadoBines', message: 'Listado de BINes es obligatorio' },
        ],
    },
];

export const URL_VALIDATION_FIELDS = [];

export const PAYLOAD_FIELDS = [
    { key: 'tipo_evento', value: ({ selectedType }) => selectedType },
    { key: 'cargado_por', field: 'cargadoPor' },
    { key: 'nombre_evento', field: 'nombreEvento' },
    { key: 'organizador', field: 'organizador' },
    { key: 'ode', field: 'ode' },
    { key: 'codigo_evento', field: 'codigoEvento' },
    { key: 'Country', byType: { PARTIDO: 'countryPartido', ABONO: 'countryAbono' } },
    { key: 'rival', field: 'rival', onlyFor: 'PARTIDO' },
    { key: 'fecha_hora_evento', field: 'fechaHoraEvento', onlyFor: 'PARTIDO' },
    { key: 'cantidad_eventos_abono', field: 'cantidadEventosAbono', onlyFor: 'ABONO', transform: 'number' },
    { key: 'codigos_eventos_abono', field: 'codigosEventosAbono', onlyFor: 'ABONO' },
    { key: 'fecha_apagado_abono', field: 'fechaApagadoAbono', onlyFor: 'ABONO' },
    { key: 'fecha_publicacion', field: 'fechaPublicacion' },
    { key: 'modo_encendido', field: 'modoEncendido' },
    { key: 'estadio', field: 'estadio' },
    { key: 'max_boletos_por_usuario', field: 'maxBoletos', transform: 'number' },
    { key: 'medios_pago_fans', field: 'mediosFans', transform: 'checkboxGroup' },
    { key: 'medios_pago_asesores', field: 'mediosAsesores', transform: 'checkboxGroup' },
    { key: 'cuotas_cantidad', field: 'cuotasCantidad', transform: 'number' },
    { key: 'cuotas_interes', field: 'cuotasInteres', transform: 'number' },
    { key: 'exclusividad_bines', field: 'toggleBines', transform: 'toggle' },
    { key: 'listado_bines', field: 'listadoBines', whenToggle: 'toggleBines' },
    { key: 'cash_payment_due_days', field: 'cashPaymentDueDays', transform: 'number' },
    { key: 'qr_type', field: 'qrType' },
    { key: 'connection_mode', field: 'connectionMode' },
    { key: 'pedidos_adicionales', field: 'pedidosAdicionales' },
    { key: 'submitted_at', value: () => new Date().toISOString() },
];
