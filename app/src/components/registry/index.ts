import { ComponentType, lazy } from 'react';

interface ComponentProps {
  [key: string]: any;
}

export function getComponent(type: string): ComponentType<ComponentProps> | null {
  switch (type) {
    case 'weather':
      return lazy(() => import('./windows/Weather'));
    case 'email':
      return lazy(() => import('./windows/Email'));
    case 'calendar':
      return lazy(() => import('./windows/Calendar'));
    case 'todo':
      return lazy(() => import('./windows/ToDo'));
    case 'notes':
      return lazy(() => import('./windows/Notes'));
    case 'reminders':
      return lazy(() => import('./windows/Reminders'));
    default:
      return null;
  }
}