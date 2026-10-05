/** Registers the "phaser" → stub alias for every test process. */
import { register } from 'node:module';
register('./phaser-loader.mjs', import.meta.url);
