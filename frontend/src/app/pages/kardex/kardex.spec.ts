import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Kardex } from './kardex';

describe('Kardex', () => {
  let fixture: ComponentFixture<Kardex>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Kardex],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Kardex);
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
