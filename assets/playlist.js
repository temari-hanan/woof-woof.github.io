/*********************************************
 * ① 再生する曲データの初期化
 *********************************************/
const availableSongs = initSongs();

/*********************************************
 * グローバル変数の定義
 *********************************************/
let playlist = [];         // ユーザー選択した再生リスト（曲オブジェクト）
let currentVideoIndex = 0; // 現在再生中の曲のインデックス
let player;                // YouTube プレイヤーオブジェクト
let timeCheckInterval;     // 再生時間チェック用タイマー
let YT_ready = false;      // YouTube API 読み込み完了フラグ
let loopEnabled = false;   // ループ再生（初期OFF）
let shuffleEnabled = false;// シャッフル再生（初期OFF）
let playedShuffleIndices = []; // シャッフル再生時に既に再生した曲のインデックス
let isTransitioning = false; // ★追加：二重発火防止
let videoEndTimestamp = 0; // ★追加：実時間ベース終了時刻

// チェック状態（選択済み曲）の保存（availableSongs の index を保持）
// localStorage からデータを取得。存在しない場合は空配列を初期値とする
let selectedSongsIndices = JSON.parse(localStorage.getItem("woof-selectedSongs") || "[]");

/*********************************************
 * 保存済み再生リストの管理
 *********************************************/
const getSavedPlaylists = () =>
  JSON.parse(localStorage.getItem("woof-savedPlaylists") || "[]");

const setSavedPlaylists = (playlists) =>
  localStorage.setItem("woof-savedPlaylists", JSON.stringify(playlists));

function updateSavedPlaylistsSelect() {
  const saved = getSavedPlaylists();
  const $select = $('#savedPlaylists');
  $select.empty();
  saved.forEach(pl => $select.append($('<option>').val(pl.name).text(pl.name)));
  // 保存済み再生リストが存在する場合のみ表示
  $('.saved-playlists').toggle(saved.length > 0);
}

/*********************************************
 * YouTubeリンクから動画再生用パラメータを取得
 *********************************************/
function getVideoParams(song) {
  const link = song.youtubeLinks[0];
  try {
    const url = new URL(link);
    const [, , videoId] = url.pathname.split('/');// embedのURLからyoutubeIdを切り出す [2]の位置
    return {
      videoId,
      start: parseInt(url.searchParams.get("start") || "0", 10),
      end:   parseInt(url.searchParams.get("end")   || "0", 10)
    };
  } catch (e) {
    console.error("YouTube URLのパースに失敗しました: " + link);
    return { videoId: '', start: 0, end: 0 };
  }
}

/*********************************************
 * videoEndTimestamp のセッター（共通）
 * params から: 曲の開始~終了の長さ分を現在時刻に加算
 * 再開時用:    現在の再生位置から終了時刻までの残り秒数を加算
 *********************************************/
const setVideoEndFromParams  = (params) =>
  videoEndTimestamp = Date.now() + (params.end - params.start) * 1000;

const setVideoEndFromCurrentTime = () => {
  const params = getVideoParams(playlist[currentVideoIndex]);
  videoEndTimestamp = Date.now() + (params.end - player.getCurrentTime()) * 1000;
};

/*********************************************
 * 指定インデックスの曲を再生する（共通処理）
 *********************************************/
function playVideo(index) {
  const params = getVideoParams(playlist[index]);
  setVideoEndFromParams(params);
  player.loadVideoById({ videoId: params.videoId, startSeconds: params.start });
  startCheckingTime();
}

function finishTransition() {
  setTimeout(() => { isTransitioning = false; }, 1000);
}

/*********************************************
 * 曲一覧をフィルタ・レンダリング
 *********************************************/
function renderSongList() {
  const keyword = document.getElementById("searchSong").value.toLowerCase();
  const songsDiv = document.getElementById("songs");
  songsDiv.innerHTML = "";

  availableSongs.forEach((song, index) => {
    // 入力されたキーワードが song プロパティに含まれているか
    if (keyword && !song.song.toLowerCase().includes(keyword)) return;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "song_checkbox_" + index;
    checkbox.dataset.index = index;
    checkbox.checked = selectedSongsIndices.includes(index);
    checkbox.addEventListener("change", function() {
      const idx = parseInt(this.dataset.index, 10);
      if (this.checked) {
        if (!selectedSongsIndices.includes(idx)) selectedSongsIndices.push(idx);
      } else {
        selectedSongsIndices = selectedSongsIndices.filter(i => i !== idx);
      }
      // 変更後の配列を localStorage に保存
      localStorage.setItem("woof-selectedSongs", JSON.stringify(selectedSongsIndices));
    });

    const label = document.createElement("label");
    label.htmlFor = "song_checkbox_" + index;
    label.textContent = " " + song.song;

    const div = document.createElement("div");
    div.className = "song-item";
    div.appendChild(checkbox);
    div.appendChild(label);
    songsDiv.appendChild(div);
  });
}

/*********************************************
 * ページ読み込み後の初期処理
 *********************************************/
$(document).ready(function() {
  renderSongList();
  updateSavedPlaylistsSelect();

  $('#searchArtist, #searchSong').on('keyup', renderSongList);

  $('#toggleLoop').click(function() {
    loopEnabled = !loopEnabled;
    $(this).toggleClass('active', loopEnabled);
  });

  $('#toggleShuffle').click(function() {
    shuffleEnabled = !shuffleEnabled;
    $(this).toggleClass('active', shuffleEnabled);
  });

  // 「再生開始」ボタン押下時の処理（画面上部にスクロール）
  $('.startPlaylist').click(function() {
    if (selectedSongsIndices.length === 0) {
      alert('再生する曲が選択されていません。');
      return;
    }
    $('html, body').animate({ scrollTop: 0 }, 500);

    // 現在のチェック状態から再生リストを作成
    playlist = selectedSongsIndices
      .filter(idx => !!availableSongs[idx])
      .map(idx => availableSongs[idx]);

    // シャッフル再生時は最初の曲もランダムに選択
    if (shuffleEnabled) {
      playedShuffleIndices = [];
      currentVideoIndex = Math.floor(Math.random() * playlist.length);
      playedShuffleIndices.push(currentVideoIndex);
    } else {
      currentVideoIndex = 0;
    }

    $('#player').show();
    $('#navButtons').show(); // 前/次ボタンを表示

    if (player) {
      playVideo(currentVideoIndex);
    } else if (YT_ready) {
      createPlayer();
    } else {
      alert('YouTube API の読み込みが完了していません。少し待ってから再度お試しください。');
    }
  });

  // 保存済み再生リストの「読み込み」ボタン
  $('#loadPlaylist').click(function() {
    const selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    const pl = getSavedPlaylists().find(p => p.name === selectedName);
    if (pl) {
      selectedSongsIndices = pl.songs;
      localStorage.setItem("woof-selectedSongs", JSON.stringify(selectedSongsIndices));
      renderSongList();
      // チェック状態更新後、再生開始イベントを発火
      $('#startPlaylist').click();
    }
  });

  // 保存済み再生リストの「保存」ボタン
  $('#savePlaylist').click(function() {
    const name = $('#playlistName').val().trim();
    if (!name) {
      alert("再生リスト名を入力してください。");
      return;
    }
    const saved = getSavedPlaylists();
    const existing = saved.find(p => p.name === name);
    if (existing) {
      existing.songs = selectedSongsIndices;
    } else {
      saved.push({ name, songs: selectedSongsIndices });
    }
    setSavedPlaylists(saved);
    updateSavedPlaylistsSelect();
    $('.saved-playlists').show();
    alert("再生リストを保存しました。");
  });

  // 保存済み再生リストの「削除」ボタン
  $('#deletePlaylist').click(function() {
    const selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    if (!confirm("本当にこの再生リストを削除してもよろしいですか？")) return;
    setSavedPlaylists(getSavedPlaylists().filter(p => p.name !== selectedName));
    updateSavedPlaylistsSelect();
  });

  // 前の曲、次の曲ボタンのクリックイベント
  $('#prevButton').click(loadPreviousVideo);
  $('#nextButton').click(loadNextVideo);

  // 「リセット」ボタン
  $('.resetSelections').click(function() {
    selectedSongsIndices = [];
    localStorage.setItem("woof-selectedSongs", JSON.stringify(selectedSongsIndices));
    renderSongList();
  });
});

/*********************************************
 * YouTube IFrame API コールバック
 *********************************************/
function onYouTubeIframeAPIReady() {
  YT_ready = true;
}

/*********************************************
 * プレイヤー生成とイベント設定
 *********************************************/
function createPlayer() {
  const params = getVideoParams(playlist[currentVideoIndex]);
  setVideoEndFromParams(params);

  player = new YT.Player('player', {
    height: '240',
    width: '100%',
    videoId: params.videoId,
    playerVars: {
      autoplay: 1,
      controls: 1,
      start: params.start,
      modestbranding: 1
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerReady(event) {
  event.target.playVideo();
  startCheckingTime();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    // 一時停止からの再開時に終了時刻を現在位置から再計算して補正
    setVideoEndFromCurrentTime();
    startCheckingTime();
  } else {
    stopCheckingTime();
  }
}

/*********************************************
 * 再生時間の定期チェック
 * 一時停止中（PLAYING以外）はスキップ。
 * 再開時は onPlayerStateChange で videoEndTimestamp を補正してから
 * このタイマーが再起動されるため、時刻ズレは発生しない。
 *********************************************/
function startCheckingTime() {
  if (timeCheckInterval) clearInterval(timeCheckInterval);
  timeCheckInterval = setInterval(() => {
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;
    if (Date.now() >= videoEndTimestamp) loadNextVideo();
  }, 1000);
}

function stopCheckingTime() {
  if (timeCheckInterval) {
    clearInterval(timeCheckInterval);
    timeCheckInterval = null;
  }
}

/*********************************************
 * シャッフル時の次インデックスを決定する
 * 再生済み以外からランダム選択。全曲再生済みの場合は
 * loopEnabled なら履歴リセット、そうでなければ null を返す
 *********************************************/
function getNextShuffleIndex() {
  if (playlist.length === 1) {
    return loopEnabled ? currentVideoIndex : null;
  }

  if (playedShuffleIndices.length >= playlist.length) {
    if (loopEnabled) {
      playedShuffleIndices = [];
    } else {
      return null;
    }
  }

  const remaining = Array.from(
    { length: playlist.length },
    (_, i) => i
  ).filter(i => !playedShuffleIndices.includes(i));

  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

/*********************************************
 * 次の動画を読み込む
 *********************************************/
function loadNextVideo() {
  if (isTransitioning) return;
  isTransitioning = true;
  stopCheckingTime();

  if (shuffleEnabled) {
    const nextIndex = getNextShuffleIndex();
    if (nextIndex === null) {
      player.pauseVideo();
      isTransitioning = false;
      return;
    }
    currentVideoIndex = nextIndex;
    if (!playedShuffleIndices.includes(nextIndex)) {
      playedShuffleIndices.push(nextIndex);
    }
  } else {
    if (currentVideoIndex >= playlist.length - 1) {
      if (loopEnabled) {
        currentVideoIndex = 0;
      } else {
        player.pauseVideo();
        isTransitioning = false;
        return;
      }
    } else {
      currentVideoIndex++;
    }
  }

  playVideo(currentVideoIndex);
  finishTransition();
}

/*********************************************
 * 前の動画を読み込む
 *********************************************/
function loadPreviousVideo() {
  stopCheckingTime();

  if (shuffleEnabled) {
    if (playedShuffleIndices.length <= 1) return;
    playedShuffleIndices.pop();
    currentVideoIndex = playedShuffleIndices.at(-1);
  } else {
    if (currentVideoIndex > 0) {
      currentVideoIndex--;
    } else if (loopEnabled) {
      currentVideoIndex = playlist.length - 1;
    } else {
      return;
    }
  }

  playVideo(currentVideoIndex);
}