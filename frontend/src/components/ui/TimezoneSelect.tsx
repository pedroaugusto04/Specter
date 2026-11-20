'use client';

import * as React from 'react';
import { getAllIanaTimezones, getBrowserTimezone } from '@/lib/utils';
import { SearchablePreference, type SearchablePreferenceProps } from './SearchablePreference';

export type TimezoneSelectProps = Pick<
  SearchablePreferenceProps,
  'id' | 'value' | 'onChange' | 'disabled' | 'className'
>;

export function TimezoneSelect(props: TimezoneSelectProps) {
  const browserTimezone = React.useMemo(getBrowserTimezone, []);
  const options = React.useMemo(
    () => getAllIanaTimezones().map((option) => ({
      ...option,
      searchText: `${option.city} ${option.offset}`,
    })),
    []
  );
  return (
    <SearchablePreference
      {...props}
      options={options}
      browserOption={{ value: browserTimezone, label: 'Use browser timezone', detail: browserTimezone }}
      searchPlaceholder="Search by city, region, or GMT offset..."
      noResults="No timezones found"
    />
  );
}
