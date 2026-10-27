import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface AnnouncementMessage {
  id: string;
  title: string;
  message: string;
}

@Component({
  selector: 'app-announcements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcements.component.html',
  styleUrl: './announcements.component.scss'
})
export class AnnouncementsComponent {
  @Input({ required: true }) announcements: readonly AnnouncementMessage[] = [];
}
