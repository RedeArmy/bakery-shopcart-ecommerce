// Fixture: el shared-kernel no puede hacer E/S
import { readFileSync } from 'node:fs';

export const read = readFileSync;
