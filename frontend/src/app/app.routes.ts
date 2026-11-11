import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Registro } from './pages/registro/registro';
import { Recuperar } from './pages/recuperar/recuperar';
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
import { Kardex } from './pages/kardex/kardex';
import { Mapeo } from './pages/mapeo/mapeo';
import { Lotes } from './pages/lotes/lotes';
import { autenticado } from './guards/autenticado';
import { rolPermitido } from './guards/rol';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Páginas SIN barra lateral
  { path: 'login', component: Login },
  { path: 'registro', component: Registro },
  { path: 'recuperar', component: Recuperar },

  // Páginas CON barra lateral
  {
    path: '',
    component: Layout,
    canActivate: [autenticado],
    canActivateChild: [autenticado, rolPermitido],
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'inventario', component: Inventario },
      { path: 'kardex', component: Kardex },
      { path: 'lotes', component: Lotes },
      { path: 'mapeo', component: Mapeo },
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