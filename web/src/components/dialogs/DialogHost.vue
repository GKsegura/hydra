<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import type { Component } from 'vue';
import { state } from '../../store.ts';
import CheckoutChangesDialog from './CheckoutChangesDialog.vue';
import CloneDialog from './CloneDialog.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import CreateBranchDialog from './CreateBranchDialog.vue';
import CreateRepoDialog from './CreateRepoDialog.vue';
import CreateTagDialog from './CreateTagDialog.vue';
import DeleteBranchDialog from './DeleteBranchDialog.vue';
import GitHubDialog from './GitHubDialog.vue';
import MergeDialog from './MergeDialog.vue';
import PublishDialog from './PublishDialog.vue';
import RenameBranchDialog from './RenameBranchDialog.vue';
import StashDialog from './StashDialog.vue';

// Um diálogo por vez; openDialog('tipo', props) em actions.ts escolhe qual.
const DIALOGS: Record<string, Component> = {
  confirm: ConfirmDialog,
  'create-branch': CreateBranchDialog,
  'rename-branch': RenameBranchDialog,
  'delete-branch': DeleteBranchDialog,
  'checkout-changes': CheckoutChangesDialog,
  merge: MergeDialog,
  'create-tag': CreateTagDialog,
  clone: CloneDialog,
  init: CreateRepoDialog,
  publish: PublishDialog,
  github: GitHubDialog,
  stash: StashDialog,
};
</script>

<template>
  <component :is="DIALOGS[state.dialog.kind]" v-if="state.dialog && DIALOGS[state.dialog.kind]" :key="state.dialog.kind" v-bind="state.dialog.props" />
</template>
