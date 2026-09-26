<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Ref } from '../types.ts';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ refs: Ref[]; color: string }>();

interface Badge {
  kind: 'branch' | 'tag' | 'head';
  label: string;
  local?: boolean;
  remote?: boolean;
  current?: boolean;
  full: string[];
}

// Junta "main" local e "origin/main" num badge só, como o GitKraken faz.
const badges = computed(() => {
  const groups = new Map<string, Badge>();
  for (const r of props.refs) {
    if (r.type === 'tag') groups.set(`t:${r.name}`, { kind: 'tag', label: r.name, full: [r.name] });
    else if (r.type === 'head') groups.set('HEAD', { kind: 'head', label: 'HEAD', full: ['HEAD'] });
    else {
      const name = r.type === 'remote' ? r.name.slice(r.name.indexOf('/') + 1) : r.name;
      const g = groups.get(`b:${name}`) ?? { kind: 'branch', label: name, full: [] };
      if (r.type === 'local') {
        g.local = true;
        g.current ||= !!r.current;
      } else g.remote = true;
      g.full.push(r.name);
      groups.set(`b:${name}`, g);
    }
  }
  const rank = (b: Badge) => (b.current ? 0 : b.kind === 'head' ? 1 : b.kind === 'branch' ? (b.local ? 2 : 3) : 4);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
});

const first = computed(() => badges.value[0]);
const rest = computed(() => badges.value.slice(1));
const restTitle = computed(() => rest.value.map((b) => (b.kind === 'tag' ? `tag ${b.label}` : b.label)).join(', '));
</script>

<template>
  <template v-if="first">
    <span v-if="first.kind === 'tag'" class="badge tag" :title="`tag ${first.label}`"><AppIcon name="tag" /><span class="name">{{ first.label }}</span></span>
    <span v-else-if="first.kind === 'head'" class="badge head" title="HEAD destacado"><span class="name">HEAD</span></span>
    <span v-else class="badge" :class="{ current: first.current }" :style="{ '--c': color }" :title="first.full.join(' · ')">
      <AppIcon v-if="first.current" name="check" />
      <span class="name">{{ first.label }}</span>
      <AppIcon v-if="first.local" name="local" />
      <AppIcon v-if="first.remote" name="remote" />
    </span>
    <span v-if="rest.length" class="more" :title="restTitle">+{{ rest.length }}</span>
  </template>
</template>
