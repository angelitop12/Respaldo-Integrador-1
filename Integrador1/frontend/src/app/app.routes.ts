import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Registro } from './pages/registro/registro';
import { Layout } from './layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { Inventario } from './pages/inventario/inventario';
import { Ventas } from './pages/ventas/ventas';
import { Compras } from './pages/compras/compras';
import { Clientes } from './pages/clientes/clientes';
import { Proveedores } from './pages/proveedores/proveedores';
import { Reportes } from './pages/reportes/reportes';
import { HistorialMensual } from './pages/historial-mensual/historial-mensual';
import { Configuracion } from './pages/configuracion/configuracion';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Páginas SIN barra lateral
  { path: 'login', component: Login },
  { path: 'registro', component: Registro },

  // Páginas CON barra lateral
  {
    path: '',
    component: Layout,
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'inventario', component: Inventario },
      { path: 'ventas', component: Ventas },
      { path: 'compras', component: Compras },
      { path: 'clientes', component: Clientes },
      { path: 'proveedores', component: Proveedores },
      { path: 'reportes', component: Reportes },
      { path: 'historial-mensual', component: HistorialMensual },
      { path: 'configuracion', component: Configuracion },
    ],
  },

  { path: '**', redirectTo: 'dashboard' },
];