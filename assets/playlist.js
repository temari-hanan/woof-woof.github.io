/*********************************************
 * ① 再生する曲データの初期化
 *********************************************/
var availableSongs = initSongs();

/*********************************************
 * グローバル変数の定義
 *********************************************/
var playlist = [];         // ユーザー選択した再生リスト（曲オブジェクト）
var currentVideoIndex = 0; // 現在再生中の曲のインデックス
var player;                // YouTube プレイヤーオブジェクト
var timeCheckInterval;     // 再生時間チェック用タイマー
var YT_ready = false;      // YouTube API 読み込み完了フラグ
var loopEnabled = false;   // ループ再生（初期OFF）
var shuffleEnabled = false;// シャッフル再生（初期OFF）
var playedShuffleIndices = []; // シャッフル再生時に既に再生した曲のインデックス
var isTransitioning = false; // ★追加：二重発火防止
var videoEndTimestamp = 0; // ★追加：実時間ベース終了時刻

// チェック状態（選択済み曲）の保存（availableSongs の index を保持）
// localStorage からデータを取得。存在しない場合は空配列を初期値とする
var selectedSongsIndices = JSON.parse(localStorage.getItem("woof-selectedSongs") || "[]");

/*********************************************
 * 保存済み再生リストの管理
 *********************************************/
function getSavedPlaylists() {
  return JSON.parse(localStorage.getItem("woof-savedPlaylists") || "[]");
}

function setSavedPlaylists(playlists) {
  localStorage.setItem("woof-savedPlaylists", JSON.stringify(playlists));
}

function updateSavedPlaylistsSelect() {
  var saved = getSavedPlaylists();
  var $select = $('#savedPlaylists');
  $select.empty();
  saved.forEach(function(pl) {
    $select.append($('<option>').val(pl.name).text(pl.name));
  });
  // 保存済み再生リストが存在する場合のみ表示
  $('.saved-playlists').toggle(saved.length > 0);
}

/*********************************************
 * YouTubeリンクから動画再生用パラメータを取得
 *********************************************/
function getVideoParams(song) {
  var link = song.youtubeLinks[0];
  try {
    var url = new URL(link);
    var pathParts = url.pathname.split('/');
    return {
      videoId: pathParts[2],
      start: parseInt(url.searchParams.get("start") || "0", 10),
      end:   parseInt(url.searchParams.get("end")   || "0", 10)
    };
  } catch (e) {
    console.error("YouTube URLのパースに失敗しました: " + link);
    return { videoId: '', start: 0, end: 0 };
  }
}

/*********************************************
 * 指定インデックスの曲を再生する（共通処理）
 *********************************************/
function playVideo(index) {
  var params = getVideoParams(playlist[index]);
  videoEndTimestamp = Date.now() + (params.end - params.start) * 1000;
  player.loadVideoById({ videoId: params.videoId, startSeconds: params.start });
  startCheckingTime();
}

/*********************************************
 * 再生終了時刻を「現在の再生位置」から再計算する
 * 一時停止からの再開時などに呼び出す
 *********************************************/
function recalcVideoEndTimestamp() {
  var params = getVideoParams(playlist[currentVideoIndex]);
  var currentTime = player.getCurrentTime();  // 現在の再生位置（秒）
  var remaining = params.end - currentTime;   // 終了時刻までの残り秒数
  videoEndTimestamp = Date.now() + remaining * 1000;
}

function finishTransition() {
  setTimeout(function() { isTransitioning = false; }, 1000);
}

/*********************************************
 * 曲一覧をフィルタ・レンダリング
 *********************************************/
function renderSongList() {
  var keyword = document.getElementById("searchSong").value.toLowerCase();
  var songsDiv = document.getElementById("songs");
  songsDiv.innerHTML = "";

  availableSongs.forEach(function(song, index) {
    // 入力されたキーワードが song プロパティに含まれているか
    if (keyword && song.song.toLowerCase().indexOf(keyword) === -1) return;

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "song_checkbox_" + index;
    checkbox.setAttribute("data-index", index);
    checkbox.checked = selectedSongsIndices.indexOf(index) !== -1;
    checkbox.addEventListener("change", function() {
      var idx = parseInt(this.getAttribute("data-index"), 10);
      if (this.checked) {
        if (selectedSongsIndices.indexOf(idx) === -1) selectedSongsIndices.push(idx);
      } else {
        selectedSongsIndices = selectedSongsIndices.filter(function(i) { return i !== idx; });
      }
      // 変更後の配列を localStorage に保存
      localStorage.setItem("woof-selectedSongs", JSON.stringify(selectedSongsIndices));
    });

    var label = document.createElement("label");
    label.htmlFor = "song_checkbox_" + index;
    label.textContent = " " + song.song;

    var div = document.createElement("div");
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
      .filter(function(idx) { return !!availableSongs[idx]; })
      .map(function(idx) { return availableSongs[idx]; });

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
    var selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    var pl = getSavedPlaylists().find(function(p) { return p.name === selectedName; });
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
    var name = $('#playlistName').val().trim();
    if (!name) {
      alert("再生リスト名を入力してください。");
      return;
    }
    var saved = getSavedPlaylists();
    var existing = saved.find(function(p) { return p.name === name; });
    if (existing) {
      existing.songs = selectedSongsIndices;
    } else {
      saved.push({ name: name, songs: selectedSongsIndices });
    }
    setSavedPlaylists(saved);
    updateSavedPlaylistsSelect();
    $('.saved-playlists').show();
    alert("再生リストを保存しました。");
  });

  // 保存済み再生リストの「削除」ボタン
  $('#deletePlaylist').click(function() {
    var selectedName = $('#savedPlaylists').val();
    if (!selectedName) return;
    if (!confirm("本当にこの再生リストを削除してもよろしいですか？")) return;
    var saved = getSavedPlaylists().filter(function(p) { return p.name !== selectedName; });
    setSavedPlaylists(saved);
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
  var params = getVideoParams(playlist[currentVideoIndex]);
  videoEndTimestamp = Date.now() + (params.end - params.start) * 1000;

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
    recalcVideoEndTimestamp();
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
  timeCheckInterval = setInterval(function() {
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

  var remaining = [];
  for (var i = 0; i < playlist.length; i++) {
    if (playedShuffleIndices.indexOf(i) === -1) remaining.push(i);
  }

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

  var nextIndex;

  if (shuffleEnabled) {
    nextIndex = getNextShuffleIndex();
    if (nextIndex === null) {
      player.pauseVideo();
      isTransitioning = false;
      return;
    }
    currentVideoIndex = nextIndex;
    if (playedShuffleIndices.indexOf(nextIndex) === -1) {
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
    currentVideoIndex = playedShuffleIndices[playedShuffleIndices.length - 1];
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