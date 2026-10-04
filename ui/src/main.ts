import 'katex/dist/katex.min.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/inter/wght-italic.css';
import './styles/base.css';
import './styles/prose.css';
import './styles/shell.css';
import './styles/lesson.css';
import './styles/map.css';
import './styles/charts.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
