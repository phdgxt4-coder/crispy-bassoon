/* early theme */
(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;else if(matchMedia("(prefers-color-scheme:dark)").matches)document.documentElement.dataset.theme="dark"}catch(e){}})();
