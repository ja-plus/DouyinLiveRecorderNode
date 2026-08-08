import { ref } from 'vue';

const mobileMedia = window.matchMedia('(max-width: 640px)');

export const isMobile = ref(mobileMedia.matches);

mobileMedia.addEventListener('change', (event) => {
  isMobile.value = event.matches;
});
