import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withViewTransitions: cruce suave al cambiar de pantalla (en los navegadores que lo soportan)
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(),
  ],
};
