import './ui/styles.css';
import { createLocalStore } from './core/index';
import { startApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Hittade inte #app');
startApp(root, createLocalStore());
