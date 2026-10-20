import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Compras } from './compras';

describe('Compras', () => {
  let fixture: ComponentFixture<Compras>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Compras],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Compras);
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
