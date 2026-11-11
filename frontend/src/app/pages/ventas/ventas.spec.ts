import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Ventas } from './ventas';

describe('Ventas', () => {
  let fixture: ComponentFixture<Ventas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ventas],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Ventas);
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
