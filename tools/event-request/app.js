import { DEFAULT_EVENT_TYPE } from './js/config.js';
import { initializeAbonoCodeCounter, initializeActions, initializeCheckboxes, initializeRealtimeValidation } from './js/interactions.js';
import { selectType } from './js/ui.js';

initializeActions();
initializeCheckboxes();
initializeAbonoCodeCounter();
initializeRealtimeValidation();
selectType(DEFAULT_EVENT_TYPE);
