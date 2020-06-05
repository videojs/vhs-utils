#!/usr/bin/env sh

DEBUG=""

if [ -n "$1" ]; then
	DEBUG="foo"
fi


JOBS=""

__ffmpeg() {
	for last; do true; done
	cmd="ffmpeg -loglevel panic -y -i oceans.mp4 -strict experimental -hide_banner -t 00:00:01 $*"

	if ! bash -c "$cmd"; then
		if [ -z "$DEBUG" ]; then
			echo "FAIL: $last"
		else
			echo "FAIL: $cmd"
		fi
	else
		if [ -z "$DEBUG" ]; then
			echo "PASS: $last"
		fi

	fi
}

_ffmpeg() {
	__ffmpeg "$@" &
	JOBS="${JOBS} ${!}"
}


__xTwoSixFive() {
	container="$1"
	name="$2"
	args="$3"
	retag="$4"

	if [ -n "$retag" ]; then
		retag="-tag:v hvc1"
	else
		retag=""
	fi
	cmd="ffmpeg -loglevel panic -y -i oceans.mp4 -strict experimental -hide_banner -t 00:00:01 -f yuv4mpegpipe -pix_fmt yuv420p - | x265 --log-level 0 --y4m --input - $args '${container}/${name}.265' && ffmpeg -hide_banner -loglevel panic -y -i '${container}/${name}.265' -strict experimental -c copy ${retag} '${container}/${name}.${container}'"

	if ! bash -c "$cmd"; then
		if [ -z "$DEBUG" ]; then
			echo "FAIL: $last"
		else
			echo "FAIL: $cmd"
		fi
	else
		if [ -z "$DEBUG" ]; then
			echo "PASS: $last"
		fi
	fi

	rm -f "${container}/${name}.265"
}

_xtwoSixFive() {
	__xTwoSixFive "$1" "$2" "$3" "$4" &
	JOBS="${JOBS} ${!}"
}

for container in mkv; do
	rm -rf "./${container}/"
	mkdir -p "./${container}"
	# audio formats
	_ffmpeg -vn -acodec aac "${container}/mp4a.40.2.${container}"
	_ffmpeg -vn -acodec aac -profile:a aac_he "${container}/mp4a.40.5.${container}"
	_ffmpeg -vn -acodec aac -profile:a aac_he_v2 "${container}/mp4a.40.29.${container}"
	_ffmpeg -vn -acodec mp3 "${container}/mp4a.40.34.${container}"
	_ffmpeg -vn -acodec speex "${container}/speex.${container}"
	_ffmpeg -vn -acodec libopus "${container}/opus.${container}"
	_ffmpeg -vn -acodec vorbis "${container}/vorbis.${container}"
	_ffmpeg -vn -acodec ac3 "${container}/ac3.${container}"
	_ffmpeg -vn -acodec eac3 "${container}/ec3.${container}"
	_ffmpeg -vn -acodec flac "${container}/flac.${container}"
	_ffmpeg -vn -acodec alac "${container}/alac.${container}"

	# video formats
	# TODO: generate more content
	# Profile.leveltier.bitdepth.[monochromeflag].[chromesubsample].[colorprimary].[transferchar].[matrixco].[full color]
	_ffmpeg -an -vcodec av1 -cpu-used 8 "${container}/av01.${container}"

	# TODO: us another encoder, ffmpeg does not support codecPrivate for vp09
	# profile.level.depth.chroma.[color-primary].[transferchar].[matrixco].[blacklevel]
	_ffmpeg -an -vcodec vp9 "${container}/vp09.${container}"
	_ffmpeg -an -vcodec vp8 "${container}/vp08.${container}"

	# ffmpeg uses contrained baseline by default
	_ffmpeg -an -vcodec libx264 -profile:v baseline -level 1.3 "${container}/avc1.42C00D.${container}"
	_ffmpeg -an -vcodec libx264 -profile:v main -level 3.0 "${container}/avc1.4D401E.${container}"
	_ffmpeg -an -vcodec libx264 -profile:v high -level 4.0 "${container}/avc1.640028.${container}"

	# https://trac.ffmpeg.org/ticket/2901
	# aka profile is first 4 bits, level is second 4 bits
	_ffmpeg -an -vcodec mpeg4 -profile:v 0 -level 9 "${container}/mp4v.20.9.${container}"
	_ffmpeg -an -vcodec mpeg4 -profile:v 15 -level 0 "${container}/mp4v.20.240.${container}"

	_xtwoSixFive "${container}" "hev1.4.10.H120.99.88" "--profile main12 --level-idc 4.0"
	# profile change
	_xtwoSixFive "${container}" "hev1.2.4.H120.90" "--profile main10 --level-idc 4.0"
	# level change
	_xtwoSixFive "${container}" "hev1.4.10.H150.99.88" "--profile main12 --level-idc 5.0"
	# no tier
	_xtwoSixFive "${container}" "hev1.4.10.L120.99.88" "--profile main12 --level-idc 4.0 --no-high-tier"
	# another profile
	_xtwoSixFive "${container}" "hev1.1.6.H120.90" "--profile main --level-idc 4.0"
	# other codec tag
	_xtwoSixFive "${container}" "hvc1.4.10.H120.99.88" "--profile main12 --level-idc 4.0" "1"

	_ffmpeg -an -vcodec theora "${container}/theora.${container}"
done;

rm -rf ./video ./audio
mkdir -p ./video
mkdir -p ./audio

# audio formats
_ffmpeg -vn -acodec aac "audio/mp4a.40.2.aac"
_ffmpeg -vn -acodec mp3 "audio/mp4a.40.34.mp3"
_ffmpeg -vn -acodec speex "audio/speex.spx"
_ffmpeg -vn -acodec opus "audio/opus.opus"
_ffmpeg -vn -acodec ac3 "audio/ac3.ac3"
_ffmpeg -vn -acodec flac "audio/flac.flac"

_ffmpeg -vn -acodec wav "audio/wav.wav"
_ffmpeg -vn -acodec aac "audio/aac.wav"
_ffmpeg -vn -acodec mp3 "audio/mp3.wav"

_ffmpeg -an -vcodec libx264 "video/x264.264"

wait
# remove any failures
find ./ -type f -size 0 -exec rm -f {} \;
