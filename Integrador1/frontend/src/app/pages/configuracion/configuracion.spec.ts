import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Configuracion } from './configuracion';

describe('Configuracion', () => {
  let fixture: ComponentFixture<Configuracion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Configuracion],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Configuracion);
    fixture.detectChanges();
  });

  it('se crea', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('dibuja el título de la página', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1, h2')?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
